import { VersionedTransaction } from '@solana/web3.js';
import { formatAmount } from './market.js';

// Public cluster identities, verified through getGenesisHash.
export const LAUNCH_NETWORKS = Object.freeze({
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d': { name: 'Solana mainnet', explorerQuery: '' },
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG': { name: 'Solana devnet', explorerQuery: '?cluster=devnet' },
});

const networkName = chain => LAUNCH_NETWORKS[chain]?.name || 'the selected Solana network';
const fundingSummary = ({ chain, payer, costs }) =>
  `Wallet ${payer.toBase58()} on ${networkName(chain)}: ${formatAmount(costs.balanceLamports, 9)} native SOL at the last balance check; ${formatAmount(costs.requiredLamports, 9)} SOL required.`;

export function requireTransactionFunds(details) {
  if (!details.costs.sufficient) {
    throw new Error(`Insufficient SOL. ${fundingSummary(details)} You need ${formatAmount(details.costs.shortfallLamports, 9)} more SOL for the purchase, account deposits and fees. Check the connected Phantom account and network, then review again.`);
  }
}

// AccountNotFound is a transaction-level funding error, not a missing new mint
// or an instruction asking for WSOL. Keep Phantom and RPC failures distinguishable.
export function explainFundingError(error, details, source) {
  const text = [error?.message, error?.data?.err, error?.data?.message,
    error?.error?.message, error?.error?.data?.err, error?.transactionError?.message]
    .filter(value => typeof value === 'string').join(' ');
  if (!/\bAccountNotFound\b|attempt to debit an account.*prior credit|\bInsufficientFundsForFee\b/i.test(text)) return error;
  return new Error(`${source} could not find a funded fee payer or enough SOL for its fee. ${fundingSummary(details)} Check that Phantom uses this account and network, then review again. Kydos has not submitted this transaction.`, { cause: error });
}

export async function simulateLaunchBeforeSigning(connection, transaction, details) {
  // Wrap the existing legacy message only to use web3.js's config overload.
  // Its legacy overload refreshes the blockhash. Never mutate the reviewed tx.
  const unsigned = new VersionedTransaction(transaction.compileMessage());
  let result;
  try {
    result = await connection.simulateTransaction(unsigned, { commitment: 'confirmed', sigVerify: false });
  } catch (error) {
    throw explainFundingError(error, details, 'Solana simulation');
  }
  if (!result?.value || result.value.err === undefined) throw new Error('Launch simulation result unavailable. Review again before signing.');
  if (result.value.err !== null) {
    const code = typeof result.value.err === 'string' ? result.value.err : JSON.stringify(result.value.err);
    const message = code === 'BlockhashNotFound'
      ? 'The transaction expired during preparation. Review the launch again.'
      : `Launch simulation failed on ${networkName(details.chain)}: ${code}. Kydos has not submitted this transaction.`;
    const error = new Error(message, { cause: result.value });
    throw explainFundingError(error, details, 'Solana simulation');
  }
}
