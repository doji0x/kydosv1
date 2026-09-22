import { SOL_MINT } from './solanaProtocol.js';
const units = leg => {
  const raw = leg?.rawTokenAmount;
  const amount = raw && /^\d+$/.test(String(raw.tokenAmount)) && Number.isInteger(raw.decimals) && raw.decimals >= 0 && raw.decimals <= 18
    ? Number(raw.tokenAmount) / 10 ** raw.decimals : Number(leg?.tokenAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};
// One aggregate enhanced swap, excluding duplicate inner routing legs.
// This adapter is not used for canonical Kydos curve data.
export function normalizeHeliusTrade(transaction, mint, chain) {
  if (!chain) throw new Error('Verified Solana chain required');
  if (!transaction?.signature || transaction.transactionError) return null;
  const swap = transaction.events?.swap;
  if (!swap || mint === SOL_MINT) return null;
  const inputs = (swap.tokenInputs || []).filter(leg => leg.mint === mint), outputs = (swap.tokenOutputs || []).filter(leg => leg.mint === mint);
  if (!!inputs.length === !!outputs.length) return null;
  const buy = outputs.length > 0, legs = buy ? outputs : inputs;
  const native = Number((buy ? swap.nativeInput : swap.nativeOutput)?.amount) / 1e9;
  const wsol = (buy ? swap.tokenInputs || [] : swap.tokenOutputs || []).filter(leg => leg.mint === SOL_MINT).reduce((sum, leg) => sum + units(leg), 0);
  const sol = Number.isFinite(native) && native > 0 ? native : wsol, tokens = legs.reduce((sum, leg) => sum + units(leg), 0);
  if (!(sol > 0 && tokens > 0)) return null;
  const owners = new Set(legs.map(leg => leg.userAccount).filter(Boolean));
  return { event_id: `${chain}:helius-enhanced:${transaction.signature}:swap`, chain, signature: transaction.signature, mint,
    wallet: owners.size === 1 ? [...owners][0] : '', side: buy ? 'buy' : 'sell', source: 'helius-enhanced',
    sol_amount: sol, token_amount: tokens, slot: transaction.slot, block_time: transaction.timestamp, status: 'confirmed' };
}
