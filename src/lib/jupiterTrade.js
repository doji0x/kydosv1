import { base44 } from '@/api/base44Client';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SWAP_SCOPE = 'jupiter-swap-v2';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export function counterAsset(mint) { return mint === SOL_MINT ? { mint: USDC_MINT, symbol: 'USDC', decimals: 6 } : { mint: SOL_MINT, symbol: 'SOL', decimals: 9 }; }
export function swapAmount(text, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Token precision is unavailable.');
  if (typeof text !== 'string' || text.length > 280 || !/^\d+(\.\d+)?$/.test(text)) throw new Error('Enter a positive decimal amount.');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const raw = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (raw <= 0n || raw > 18446744073709551615n) throw new Error('Amount is outside the supported range.');
  return raw.toString();
}
export function swapDisplay(raw, decimals) {
  if (raw == null || !Number.isInteger(decimals)) return '—';
  const value = String(raw).padStart(decimals + 1, '0');
  if (!decimals) return value;
  const fraction = value.slice(-decimals).replace(/0+$/, '');
  return value.slice(0, -decimals) + (fraction ? `.${fraction}` : '');
}
export async function tradingRequest(payload) {
  try {
    const { data } = await base44.functions.invoke('jupiterTrade', payload);
    if (data.error && !data.status) throw new Error(data.error);
    return data;
  } catch (error) { throw new Error(error.response?.data?.error || error.message || 'Trading is temporarily unavailable.'); }
}