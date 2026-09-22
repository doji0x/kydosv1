import { Buffer } from 'node:buffer';

// Account order and data are parity-tested against the Anchor client builder.
export function buildAdminLaunchTransaction(web3, { signer, mint, programId, metadataProgramId, tokenProgramId, name, symbol, metadataUri, blockhash }) {
  const { PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SystemProgram, SYSVAR_RENT_PUBKEY } = web3;
  const seed = text => Buffer.from(text);
  const [curve] = PublicKey.findProgramAddressSync([seed('curve'), mint.publicKey.toBuffer()], programId);
  const [feePolicy] = PublicKey.findProgramAddressSync([seed('fee_policy'), curve.toBuffer()], programId);
  const [vault] = PublicKey.findProgramAddressSync([seed('vault'), mint.publicKey.toBuffer()], programId);
  const [metadata] = PublicKey.findProgramAddressSync([seed('metadata'), metadataProgramId.toBuffer(), mint.publicKey.toBuffer()], metadataProgramId);
  const string = value => { const bytes = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32LE(bytes.length); return Buffer.concat([size, bytes]); };
  const keys = [signer.publicKey, mint.publicKey, curve, feePolicy, vault, metadata, metadataProgramId, tokenProgramId, SystemProgram.programId, SYSVAR_RENT_PUBKEY]
    .map((pubkey, index) => ({ pubkey, isSigner: index < 2, isWritable: index < 6 }));
  const instruction = new TransactionInstruction({ programId, keys, data: Buffer.concat([Buffer.from([175,175,109,31,13,152,155,237]), string(name), string(symbol), string(metadataUri)]) });
  const transaction = new Transaction({ feePayer: signer.publicKey, recentBlockhash: blockhash }).add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), instruction);
  return { transaction, curve, feePolicy, vault, metadata };
}
const integer = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} unavailable; retry the status check.`);
  return value;
};
export async function estimateAdminLaunchCosts(connection, transaction, payer) {
  const [balance, fee, ...rents] = await Promise.all([connection.getBalance(payer, 'confirmed'), connection.getFeeForMessage(transaction.compileMessage(), 'confirmed'),
    ...[82, 397, 76, 165, 679, 1308].map(size => connection.getMinimumBalanceForRentExemption(size, 'confirmed'))]);
  const balanceLamports = integer(balance, 'Server-wallet balance'), networkFeeLamports = integer(fee?.value, 'Network fee');
  const checked = rents.map(value => integer(value, 'Rent')), rentLamports = checked.slice(0, 5).reduce((a, b) => a + b, 0);
  const metadataFeeLamports = checked[5] + 5440, requiredLamports = integer(rentLamports + metadataFeeLamports + networkFeeLamports, 'Launch funding');
  return { balanceLamports, requiredLamports, rentLamports, metadataFeeLamports, networkFeeLamports,
    shortfallLamports: Math.max(0, requiredLamports - balanceLamports), sufficient: balanceLamports >= requiredLamports };
}
export function requireAdminFunds(costs, wallet, network) {
  if (!costs.sufficient) throw new Error(`Server launch wallet ${wallet} has ${(costs.balanceLamports / 1e9).toFixed(9)} native SOL on ${network.name}; ${(costs.requiredLamports / 1e9).toFixed(9)} SOL is required for account deposits and fees (${(costs.shortfallLamports / 1e9).toFixed(9)} SOL short). Admin launch is paid by this server wallet, not your connected Phantom wallet. No transaction was submitted.`);
}
export async function adminSimulationError(error, connection, { wallet, network, costs }) {
  let logs = error?.logs;
  if (typeof error?.getLogs === 'function') { try { logs = await error.getLogs(connection); } catch { /* Preflight can return no logs. */ } }
  const message = typeof error?.message === 'string' ? error.message.replace(/https?:\/\/\S+/g, '[RPC endpoint]') : 'Simulation failed';
  const funding = /AccountNotFound|attempt to debit an account.*prior credit|InsufficientFundsForFee/i.test(message);
  return { error: funding ? `Solana could not debit server launch wallet ${wallet} on ${network.name}. Its last checked balance was ${(costs.balanceLamports / 1e9).toFixed(9)} native SOL; ${(costs.requiredLamports / 1e9).toFixed(9)} SOL was required. Check this server wallet's funding on the displayed network. Phantom funds do not pay for admin launch.` : `Launch simulation failed on ${network.name}: ${message}`,
    logs: Array.isArray(logs) ? logs.slice(-40) : [], wallet, network, submitted: false };
}
