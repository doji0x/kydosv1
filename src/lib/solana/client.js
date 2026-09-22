import { Buffer } from 'buffer';
import { AnchorProvider, BorshAccountsCoder, Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, unpackAccount } from '@solana/spl-token';
import idl from './idl/kydos_launchpad.json' with { type: 'json' };
import { rawAmount, validateLaunch } from './market.js';
import { encodeSignature, confirmTransactionHttp } from './transactions.js';
import { browserActivity } from './lifecycle.js';
import { estimateTransactionCosts } from './costs.js';
import { CURVE_TOKENS, quoteCurve } from './curveMath.js';

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

export async function sendTransaction(connection, wallet, tx, extra = [], metadata, activity = browserActivity(), options = {}) {
  if (!wallet.publicKey || typeof wallet.signTransaction !== 'function') throw new Error('Connect a signing wallet first');
  if (!metadata?.operation || !metadata?.mint) throw new Error('Recovery metadata required');
  const chain = await connection.getGenesisHash();
  if (options.expectedChain && chain !== options.expectedChain) throw new Error('Network changed. Review the launch again.');
  const payer = new PublicKey(wallet.publicKey);
  const scope = { wallet: payer.toBase58(), chain, program: PROGRAM_ID.toBase58(), operation: metadata.operation,
    conflict: metadata.operation === 'create' ? 'create' : `trade:${metadata.mint}` };
  return activity.execute(scope, metadata, async save => {
    const stage = value => { try { options.onStage?.(value); } catch { /* UI cannot interrupt transaction tracking. */ } };
    stage('preparing');
    const latest = await connection.getLatestBlockhash('confirmed');
    tx.feePayer = payer;
    tx.recentBlockhash = latest.blockhash;
    const costs = await estimateTransactionCosts({ connection, transaction: tx, payer,
      context: { ...metadata, curveSpace: CURVE_SPACE, metadataSpace: METADATA_SPACE }, prepared: true });
    if (!costs.sufficient) throw new Error(`Insufficient SOL: short ${costs.shortfallLamports} lamports for input, network fee and account rent`);
    if (options.maxCostLamports !== undefined && costs.requiredLamports > options.maxCostLamports) {
      throw new Error('Estimated cost increased. Review the launch again.');
    }
    await options.beforeSign?.();
    // Enforce the legacy packet size before asking the wallet to sign. Never split
    // a create-and-buy into separate transactions to make it fit.
    tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    if (extra.length) tx.partialSign(...extra);
    const message = Buffer.from(tx.serializeMessage());
    save({ state: 'signing', ...latest, messageBase64: message.toString('base64') });
    stage('signing');
    const signed = await wallet.signTransaction(tx);
    if (!Buffer.from(signed.serializeMessage()).equals(message)) throw new Error('Wallet changed the transaction');
    const wire = signed.serialize(); // Required signatures verified before any submission.
    const signature = encodeSignature(signed.signature);
    // Both writes must succeed and read back BEFORE the only broadcast call.
    save({ state: 'signed', signature });
    if (await connection.getGenesisHash() !== chain) throw new Error('RPC chain changed before submission');
    save({ state: 'submitting' });
    stage('submitting');
    const returned = await connection.sendRawTransaction(wire, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 });
    if (returned !== signature) throw new Error('RPC returned a different signature');
    stage('confirming');
    const result = await confirmTransactionHttp(connection, { signature, ...latest });
    if (result.value.err) {
      save({ state: 'failed', message: 'Confirmed on-chain failure' });
      throw new Error('Transaction failed on chain');
    }
    save({ state: 'confirmed', message: 'Confirmed on chain' });
    return signature;
  });
}

export function quoteInitialBuy(amount = 0n, slippageBps = 100) {
  const input = rawAmount(amount, 'Initial buy');
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10000) throw new Error('Invalid slippage');
  if (input === 0n) return { input, acceptedInput: 0n, output: 0n, minOut: 0n };
  const quote = quoteCurve('buy', 0n, CURVE_TOKENS, input);
  return { ...quote, input, minOut: (quote.output * BigInt(10000 - slippageBps) + 9999n) / 10000n };
}

export async function buildCreateTransaction({ connection, wallet, name, symbol, metadataUri, initialBuyLamports = 0n, slippageBps = 100 }) {
  validateLaunch({ name, symbol, metadataUri });
  if (!connection) throw new Error('Solana connection required');
  if (!wallet.publicKey) throw new Error('Connect a signing wallet first');
  const quote = quoteInitialBuy(initialBuyLamports, slippageBps);
  const mint = Keypair.generate();
  const { curve, vault, metadata } = deriveMarketAddresses(mint.publicKey);
  const ix = await programFor(connection, wallet).methods.initialize(name, symbol, metadataUri).accountsStrict({
    creator: wallet.publicKey, mint: mint.publicKey, curve, vault, metadata,
    metadataProgram: METADATA_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
  }).instruction();
  // Conservative execution ceiling, no priority fee. Real CU consumption must
  // be measured against the deployed binary before the deferred creation test.
  const transaction = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ix);
  if (quote.input > 0n) {
    const buy = await buildTradeTransaction({ connection, wallet, mint: mint.publicKey,
      side: 'buy', amount: quote.input, minOut: quote.minOut });
    transaction.add(...buy.instructions);
  }
  const recovery = { operation: 'create', mint: mint.publicKey.toBase58(), curve: curve.toBase58(), metadata: metadata.toBase58(), name, symbol, metadataUri,
    initialBuyLamports: quote.input.toString(), minOut: quote.minOut.toString() };
  return { transaction, mint, metadata: recovery, quote };
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
