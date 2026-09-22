import { PublicKey } from '@solana/web3.js';
import { ACCOUNT_SIZE, MINT_SIZE, TOKEN_PROGRAM_ID, getAssociatedTokenAddress, unpackAccount } from '@solana/spl-token';
import { rawAmount } from './market.js';

function rpcInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} unavailable or not a nonnegative safe integer`);
  return BigInt(value);
}

// Preview prepares a fresh message. Submission passes its already-prepared actual
// transaction so the fee is for exactly the message the wallet will sign.
export async function estimateTransactionCosts({ connection, transaction, payer, context, prepared = false }) {
  if (!context || !['create', 'buy', 'sell'].includes(context.operation) || !context.mint) throw new Error('Transaction cost context required');
  const owner = new PublicKey(payer), mint = new PublicKey(context.mint);
  const amount = context.operation === 'create' ? rawAmount(context.initialBuyLamports ?? '0', 'Initial buy') : rawAmount(context.amount);
  if (context.operation !== 'create' && amount === 0n) throw new Error('Amount must be positive');
  if (!prepared) {
    transaction.feePayer = owner;
    transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  }
  if (!transaction.feePayer?.equals(owner) || !transaction.recentBlockhash) throw new Error('Cost estimate requires the payer and recent blockhash');
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
  const networkFeeLamports = rpcInteger(fee?.value, 'Network fee');
  const balanceLamports = rpcInteger(await connection.getBalance(owner, 'confirmed'), 'SOL balance');
  const rent = async size => rpcInteger(await connection.getMinimumBalanceForRentExemption(size, 'confirmed'), 'Account rent');
  let rentLamports = 0n;
  if (context.operation === 'create') {
    if (!Number.isSafeInteger(context.curveSpace) || context.curveSpace <= 0) throw new Error('Curve account size required');
    if (!Number.isSafeInteger(context.metadataSpace) || context.metadataSpace <= 0) throw new Error('Metadata account size required');
    rentLamports = await rent(MINT_SIZE) + await rent(context.curveSpace) + await rent(ACCOUNT_SIZE) + await rent(context.metadataSpace);
    // The mint is new, so the optional creator buy needs a new associated token account.
    if (amount > 0n) rentLamports += await rent(ACCOUNT_SIZE);
  } else {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const info = await connection.getAccountInfo(ata, 'confirmed');
    if (info) {
      const account = unpackAccount(ata, info, TOKEN_PROGRAM_ID);
      if (info.executable || !account.isInitialized || account.isFrozen || !account.owner.equals(owner) || !account.mint.equals(mint)) throw new Error('Invalid wallet token account');
      const tokens = rawAmount(account.amount, 'Token balance');
      if (context.operation === 'sell' && tokens < amount) throw new Error('Insufficient sell tokens');
    } else if (context.operation === 'sell') {
      throw new Error('Sell requires an existing wallet token account');
    } else {
      rentLamports = await rent(ACCOUNT_SIZE);
    }
  }
  // No proceeds credit, quote cap, arbitrary buffer or additional protocol fee.
  const inputLamports = context.operation === 'buy' || context.operation === 'create' ? amount : 0n;
  const requiredLamports = inputLamports + networkFeeLamports + rentLamports;
  const shortfallLamports = requiredLamports > balanceLamports ? requiredLamports - balanceLamports : 0n;
  return { inputLamports, networkFeeLamports, rentLamports, requiredLamports, balanceLamports, shortfallLamports, sufficient: shortfallLamports === 0n };
}
