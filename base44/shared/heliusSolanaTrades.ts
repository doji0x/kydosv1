type EnhancedTransaction = Record<string, any>;

const validAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const asNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

function tokenUnits(transfer: any) {
  const raw = transfer?.rawTokenAmount;
  if (raw?.tokenAmount != null && Number.isInteger(Number(raw.decimals))) {
    return asNumber(raw.tokenAmount) / 10 ** Number(raw.decimals);
  }
  return asNumber(transfer?.tokenAmount);
}

function swapAmounts(transaction: EnhancedTransaction, mint: string) {
  const swap = transaction?.events?.swap;
  if (!swap) return null;
  const output = (swap.tokenOutputs || []).find((item: any) => item.mint === mint);
  const input = (swap.tokenInputs || []).find((item: any) => item.mint === mint);
  if (output) return { side: 'buy', sol: asNumber(swap.nativeInput?.amount) / 1e9, tokens: tokenUnits(output) };
  if (input) return { side: 'sell', sol: asNumber(swap.nativeOutput?.amount) / 1e9, tokens: tokenUnits(input) };
  return null;
}

export function normalizeHeliusTrade(transaction: EnhancedTransaction, mint: string) {
  if (!transaction?.signature || transaction.transactionError) return null;
  const swap = swapAmounts(transaction, mint);
  if (!swap || swap.sol <= 0 || swap.tokens <= 0) return null;
  return { signature: transaction.signature, mint, wallet: transaction.feePayer || '', side: swap.side,
    sol_amount: swap.sol, token_amount: swap.tokens, slot: asNumber(transaction.slot),
    block_time: asNumber(transaction.timestamp), status: 'confirmed' };
}

export async function fetchHeliusTradePage({ mint, apiKey, before, limit = 100 }: { mint: string, apiKey: string, before?: string, limit?: number }) {
  if (!validAddress.test(mint)) throw new Error('Valid Solana mint required');
  const url = new URL(`https://api.helius.xyz/v0/addresses/${mint}/transactions`);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))));
  if (before) url.searchParams.set('before', before);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Helius history request failed: ${response.status}`);
  const transactions = await response.json();
  const rows = transactions.map((transaction: EnhancedTransaction) => normalizeHeliusTrade(transaction, mint)).filter(Boolean);
  const signatures = transactions.map((transaction: EnhancedTransaction) => transaction.signature).filter(Boolean);
  return { rows, signatures, scanned: transactions.length, nextBefore: transactions.at(-1)?.signature || null };
}