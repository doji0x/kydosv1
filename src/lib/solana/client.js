import { Buffer } from 'buffer';
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import { rawAmount, validateLaunch } from './market.js';
import { encodeSignature, outcomeError } from './transactions.js';

// Source program identity only; not evidence of a deployment.
export const PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWxTWqkZqvFmR6UJA4R9C3bZ9S2');
// Anchor/Borsh: discriminator + keys + bytes + length-prefixed strings + u64s + bool.
export const CURVE_SPACE = 8 + 32 + 32 + 1 + 1 + 4 + 32 + 4 + 10 + 4 + 200 + 8 * 4 + 1;
const D = { initialize: [175,175,109,31,13,152,155,237], buy: [102,6,61,18,1,218,235,234], sell: [51,230,133,164,1,127,131,173] };
const meta = (pubkey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });
const u64 = value => { const b = Buffer.alloc(8); b.writeBigUInt64LE(rawAmount(value)); return b; };
const str = value => { const b = Buffer.from(value, 'utf8'), length = Buffer.alloc(4); length.writeUInt32LE(b.length); return Buffer.concat([length, b]); };

export function deriveMarketAddresses(mint) {
  const key = new PublicKey(mint);
  const [curve, bump] = PublicKey.findProgramAddressSync([Buffer.from('curve'), key.toBuffer()], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), key.toBuffer()], PROGRAM_ID);
  return { curve, vault, bump };
}

export async function decodeMarket(data, mint) {
  const b = Buffer.from(data);
  const discriminator = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode('account:Curve'))).slice(0, 8);
  if (b.length !== CURVE_SPACE || !b.subarray(0, 8).equals(Buffer.from(discriminator))) throw new Error('Invalid Curve account layout');
  let offset = 8;
  const take = count => { if (offset + count > b.length) throw new Error('Truncated Curve account'); const result = b.subarray(offset, offset + count); offset += count; return result; };
  const key = () => new PublicKey(take(32));
  const text = max => { const length = take(4).readUInt32LE(); if (length > max) throw new Error('Invalid Curve string length'); return new TextDecoder('utf-8', { fatal: true }).decode(take(length)); };
  const creator = key(), accountMint = key(), bump = take(1)[0], decimals = take(1)[0];
  const name = text(32), symbol = text(10), metadataUri = text(200);
  const totalSupply = take(8).readBigUInt64LE(), tokenReserve = take(8).readBigUInt64LE(), realSolReserve = take(8).readBigUInt64LE(), graduationTarget = take(8).readBigUInt64LE();
  const graduated = take(1)[0];
  if (!accountMint.equals(new PublicKey(mint)) || bump !== deriveMarketAddresses(mint).bump || graduated > 1) throw new Error('Curve mint, bump or flag mismatch');
  // Short strings leave allocation slack AFTER serialized fields, not fixed-width gaps.
  return { creator, mint: accountMint, bump, decimals, name, symbol, metadataUri, totalSupply, tokenReserve, realSolReserve, graduationTarget, graduated: graduated === 1 };
}

export async function fetchMarket(connection, mint) {
  const { curve, vault } = deriveMarketAddresses(mint);
  const { value, context } = await connection.getAccountInfoAndContext(curve, 'confirmed');
  if (!value) throw new Error('Market not found on this RPC');
  if (!value.owner.equals(PROGRAM_ID) || value.executable) throw new Error('Invalid market account owner');
  return { ...await decodeMarket(value.data, mint), curve, vault, slot: context.slot };
}

export async function sendTransaction(connection, wallet, tx, extra = []) {
  if (!wallet.publicKey || typeof wallet.signTransaction !== 'function') throw new Error('Connect a signing wallet first');
  const payer = new PublicKey(wallet.publicKey);
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = payer;
  tx.recentBlockhash = latest.blockhash;
  if (extra.length) tx.partialSign(...extra);
  // Snapshot before calling the provider: wallets may mutate the same object.
  const message = Buffer.from(tx.serializeMessage());
  const signed = await wallet.signTransaction(tx);
  if (!signed.serializeMessage().equals(message)) throw new Error('Wallet changed the transaction');
  const wire = signed.serialize(); // Verify required signatures before attempting submission.
  const signature = encodeSignature(signed.signature);
  let result;
  try {
    const returned = await connection.sendRawTransaction(wire, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 });
    if (returned !== signature) throw new Error('RPC returned a different signature');
    result = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  } catch (cause) {
    // Even sendRawTransaction can time out AFTER forwarding the signed bytes.
    throw outcomeError(cause, signature);
  }
  if (result.value.err) throw outcomeError(result.value.err, signature, 'failed');
  return signature;
}

export async function createLaunch({ connection, wallet, name, symbol, metadataUri }) {
  validateLaunch({ name, symbol, metadataUri });
  if (!wallet.publicKey) throw new Error('Connect a signing wallet first');
  const mint = Keypair.generate(), { curve, vault } = deriveMarketAddresses(mint.publicKey);
  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys: [
    meta(wallet.publicKey, true, true), meta(mint.publicKey, true, true), meta(curve, false, true), meta(vault, false, true),
    meta(TOKEN_PROGRAM_ID), meta(SystemProgram.programId), meta(SYSVAR_RENT_PUBKEY),
  ], data: Buffer.concat([Buffer.from(D.initialize), str(name), str(symbol), str(metadataUri)]) });
  try {
    const signature = await sendTransaction(connection, wallet, new Transaction().add(ix), [mint]);
    return { signature, mint: mint.publicKey.toBase58(), curve: curve.toBase58() };
  } catch (error) {
    error.mint = mint.publicKey.toBase58();
    throw error;
  }
}

export async function buildTradeTransaction({ wallet, mint, side, amount, minOut }) {
  if (!wallet.publicKey) throw new Error('Connect a signing wallet first');
  if (side !== 'buy' && side !== 'sell') throw new Error('Choose buy or sell');
  if (rawAmount(amount) === 0n || rawAmount(minOut, 'Minimum output') === 0n) throw new Error('Amount and minimum output must be positive');
  const key = new PublicKey(mint), { curve, vault } = deriveMarketAddresses(key);
  const ata = await getAssociatedTokenAddress(key, wallet.publicKey);
  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys: [
    meta(wallet.publicKey, true, true), meta(curve, false, true), meta(key), meta(vault, false, true), meta(ata, false, true),
    meta(TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
  ], data: Buffer.concat([Buffer.from(D[side]), u64(amount), u64(minOut)]) });
  // ATA creation and trade succeed or roll back together; no unconfirmed setup race.
  return new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ata, wallet.publicKey, key), ix);
}

export async function trade(args) {
  return sendTransaction(args.connection, args.wallet, await buildTradeTransaction(args));
}
