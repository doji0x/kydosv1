import { Buffer } from 'buffer';
import { AnchorProvider, BorshAccountsCoder, Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, unpackAccount } from '@solana/spl-token';
import idl from './idl/kydos_launchpad.json' with { type: 'json' };
import { rawAmount, validateLaunch } from './market.js';
import { encodeSignature, confirmTransactionHttp } from './transactions.js';
import { browserActivity } from './lifecycle.js';
import { estimateTransactionCosts } from './costs.js';

export const PROGRAM_ID = new PublicKey(idl.address);
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
export const CURVE_SPACE = 397;
export const METADATA_SPACE = 679;
const accountsCoder = new BorshAccountsCoder(idl);
const bn = value => new BN(rawAmount(value).toString());
const programFor = (connection, wallet) => new Program(idl, new AnchorProvider(connection, wallet, { commitment: 'confirmed' }));

export function deriveMarketAddresses(mint) {
  const key = new PublicKey(mint);
  const [curve, bump] = PublicKey.findProgramAddressSync([Buffer.from('curve'), key.toBuffer()], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), key.toBuffer()], PROGRAM_ID);
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), key.toBuffer()],
    METADATA_PROGRAM_ID,
  );
  return { curve, vault, metadata, bump };
}

export function decodeMarket(data, mint) {
  const decoded = accountsCoder.decode('curve', Buffer.from(data));
  const accountMint = new PublicKey(decoded.mint), expectedMint = new PublicKey(mint);
  const { bump } = deriveMarketAddresses(expectedMint);
  if (!accountMint.equals(expectedMint) || decoded.bump !== bump) throw new Error('Curve mint or bump mismatch');
  const amount = value => BigInt(value.toString());
  return {
    creator: new PublicKey(decoded.creator), mint: accountMint, bump: decoded.bump,
    decimals: decoded.decimals, name: decoded.name, symbol: decoded.symbol,
    metadataUri: decoded.metadataUri, totalSupply: amount(decoded.totalSupply),
    curveTokenAllocation: amount(decoded.curveTokenAllocation),
    liquidityTokenAllocation: amount(decoded.liquidityTokenAllocation),
    virtualTokenReserves: amount(decoded.virtualTokenReserves),
    virtualSolReserves: amount(decoded.virtualSolReserves),
    realTokenReserves: amount(decoded.realTokenReserves),
    tokenReserve: amount(decoded.realTokenReserves),
    realSolReserves: amount(decoded.realSolReserves),
    realSolReserve: amount(decoded.realSolReserves),
    graduationTarget: amount(decoded.graduationTarget), graduated: decoded.graduated,
  };
}

export async function fetchMarket(connection, mint) {
  const { curve, vault, metadata } = deriveMarketAddresses(mint);
  const { value, context } = await connection.getAccountInfoAndContext(curve, 'confirmed');
  if (!value) throw new Error('Market not found on this RPC');
  if (!value.owner.equals(PROGRAM_ID) || value.executable) throw new Error('Invalid market account owner');
  return { ...decodeMarket(value.data, mint), curve, vault, metadata, slot: context.slot };
}

export async function fetchBalances(connection, wallet, mint) {
  const owner = new PublicKey(wallet), key = new PublicKey(mint);
  const ata = await getAssociatedTokenAddress(key, owner);
  const [sol, info] = await Promise.all([connection.getBalance(owner, 'confirmed'), connection.getAccountInfo(ata, 'confirmed')]);
  if (!Number.isSafeInteger(sol) || sol < 0) throw new Error('SOL balance is not a safe integer');
  let tokens = 0n;
  if (info) {
    const account = unpackAccount(ata, info, TOKEN_PROGRAM_ID);
    if (!account.owner.equals(owner) || !account.mint.equals(key) || account.isFrozen) throw new Error('Invalid wallet token account');
    tokens = account.amount;
  }
  return { sol: BigInt(sol), tokens };
}

export async function sendTransaction(connection, wallet, tx, extra = [], metadata, activity = browserActivity()) {
  if (!wallet.publicKey || typeof wallet.signTransaction !== 'function') throw new Error('Connect a signing wallet first');
  if (!metadata?.operation || !metadata?.mint) throw new Error('Recovery metadata required');
  const chain = await connection.getGenesisHash();
  const payer = new PublicKey(wallet.publicKey);
  const scope = { wallet: payer.toBase58(), chain, program: PROGRAM_ID.toBase58(), operation: metadata.operation,
    conflict: metadata.operation === 'create' ? 'create' : `trade:${metadata.mint}` };
  return activity.execute(scope, metadata, async save => {
    const latest = await connection.getLatestBlockhash('confirmed');
    tx.feePayer = payer;
    tx.recentBlockhash = latest.blockhash;
    const costs = await estimateTransactionCosts({ connection, transaction: tx, payer,
      context: { ...metadata, curveSpace: CURVE_SPACE, metadataSpace: METADATA_SPACE }, prepared: true });
    if (!costs.sufficient) throw new Error(`Insufficient SOL: short ${costs.shortfallLamports} lamports for input, network fee and account rent`);
    if (extra.length) tx.partialSign(...extra);
    const message = Buffer.from(tx.serializeMessage());
    save({ state: 'signing', ...latest, messageBase64: message.toString('base64') });
    const signed = await wallet.signTransaction(tx);
    if (!Buffer.from(signed.serializeMessage()).equals(message)) throw new Error('Wallet changed the transaction');
    const wire = signed.serialize(); // Required signatures verified before any submission.
    const signature = encodeSignature(signed.signature);
    // Both writes must succeed and read back BEFORE the only broadcast call.
    save({ state: 'signed', signature });
    if (await connection.getGenesisHash() !== chain) throw new Error('RPC chain changed before submission');
    save({ state: 'submitting' });
    const returned = await connection.sendRawTransaction(wire, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 });
    if (returned !== signature) throw new Error('RPC returned a different signature');
    const result = await confirmTransactionHttp(connection, { signature, ...latest });
    if (result.value.err) {
      save({ state: 'failed', message: 'Confirmed on-chain failure' });
      throw new Error('Transaction failed on chain');
    }
    save({ state: 'confirmed', message: 'Confirmed on chain' });
    return signature;
  });
}

export async function buildCreateTransaction({ connection, wallet, name, symbol, metadataUri }) {
  validateLaunch({ name, symbol, metadataUri });
  if (!connection) throw new Error('Solana connection required');
  if (!wallet.publicKey) throw new Error('Connect a signing wallet first');
  const mint = Keypair.generate();
  const { curve, vault, metadata } = deriveMarketAddresses(mint.publicKey);
  const ix = await programFor(connection, wallet).methods.initialize(name, symbol, metadataUri).accountsStrict({
    creator: wallet.publicKey, mint: mint.publicKey, curve, vault, metadata,
    metadataProgram: METADATA_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
  }).instruction();
  const recovery = { operation: 'create', mint: mint.publicKey.toBase58(), curve: curve.toBase58(), metadata: metadata.toBase58(), name, symbol, metadataUri };
  return { transaction: new Transaction().add(ix), mint, metadata: recovery };
}

export async function createCoin(name, symbol, metadataUri, { connection, wallet }) {
  return createLaunch({ connection, wallet, name, symbol, metadataUri });
}

export async function createLaunch(args) {
  const { transaction, mint, metadata } = await buildCreateTransaction(args);
  try {
    const signature = await sendTransaction(args.connection, args.wallet, transaction, [mint], metadata);
    return { signature, mint: metadata.mint, curve: metadata.curve, metadata: metadata.metadata };
  } catch (error) { error.mint = mint.publicKey.toBase58(); throw error; }
}

export async function buildTradeTransaction({ connection, wallet, mint, side, amount, minOut }) {
  if (!connection) throw new Error('Solana connection required');
  if (!wallet.publicKey) throw new Error('Connect a signing wallet first');
  if (side !== 'buy' && side !== 'sell') throw new Error('Choose buy or sell');
  if (rawAmount(amount) === 0n || rawAmount(minOut, 'Minimum output') === 0n) throw new Error('Amount and minimum output must be positive');
  const key = new PublicKey(mint), { curve, vault } = deriveMarketAddresses(key);
  const ata = await getAssociatedTokenAddress(key, wallet.publicKey);
  const ix = await programFor(connection, wallet).methods[side](bn(amount), bn(minOut)).accountsStrict({
    trader: wallet.publicKey, curve, mint: key, vault, traderTokens: ata,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).instruction();
  const transaction = new Transaction();
  if (side === 'buy') transaction.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ata, wallet.publicKey, key));
  return transaction.add(ix);
}

export async function trade(args) {
  return sendTransaction(args.connection, args.wallet, await buildTradeTransaction(args), [], {
    operation: args.side, mint: new PublicKey(args.mint).toBase58(), amount: rawAmount(args.amount).toString(), minOut: rawAmount(args.minOut).toString(),
  });
}
