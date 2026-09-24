import { isSolanaMint } from './markets.js';

export const CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];
export const MAX_CHART_CANDLES = 6000;
export const candleQueryKey = (mint, interval) => ['external-candles', 'jupiter-sampled', 'solana-mainnet', mint, interval, 'USD', 2];
export function validateCandlePage(data, input) {
  if (!data || data.network !== 'solana-mainnet' || data.mint !== input.mint || data.interval !== input.interval || data.currency !== 'USD' || data.volumeCurrency !== 'USD' || !isSolanaMint(data.pool?.address) || (input.pool && input.pool !== data.pool.address) || data.before !== (input.before ?? null) || !Number.isFinite(data.fetchedAt) || !Array.isArray(data.candles) || data.candles.length > 300) throw new Error('The chart response did not match this market.');
  let previous = 0;
  for (const bar of data.candles) {
    const validVolume = data.volumeAvailable === false ? bar.volume === null : Number.isFinite(bar.volume) && bar.volume >= 0;
    if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) || !validVolume || !Number.isSafeInteger(bar.time) || bar.time <= previous || bar.low <= 0 || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || (input.before != null && bar.time > input.before)) throw new Error('The chart response contained invalid candles.');
    previous = bar.time;
  }
  if (data.hasMore && (!Number.isSafeInteger(data.nextBefore) || !data.candles.length || data.nextBefore >= data.candles[0].time || data.nextBefore <= 0)) throw new Error('The chart history cursor was invalid.');
  return data;
}
export function mergeCandlePages(history, latest) {
  const bars = new Map(history.map(bar => [bar.time, bar]));
  for (const bar of latest) bars.set(bar.time, bar);
  return [...bars.values()].sort((a, b) => a.time - b.time);
}
export function sparklinePath(candles, now = Date.now()) {
  const recent = candles.filter(bar => bar.time >= now / 1000 - 86400);
  if (recent.length < 2) return null;
  const prices = recent.map(bar => bar.close), min = Math.min(...prices), max = Math.max(...prices);
  const first = recent[0], last = recent.at(-1), duration = last.time - first.time;
  const path = recent.map((bar, index) => `${index === 0 || bar.time - recent[index - 1].time > 7200 ? 'M' : 'L'}${((bar.time - first.time) / duration * 160).toFixed(2)},${(max === min ? 20 : 35 - (bar.close - min) / (max - min) * 30).toFixed(2)}`).join(' ');
  return { path, rising: last.close >= first.close, first: first.time, last: last.time };
}