import { compareTrades } from './chartFeed.js';
export const TIMEFRAMES = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
];

export function bucketTrades(trades, seconds) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error('Positive candle interval required');
  const buckets = new Map();
  [...trades].sort(compareTrades).forEach(trade => {
    if (!Number.isFinite(trade.blockTime) || trade.blockTime <= 0 || !Number.isFinite(trade.price) || trade.price <= 0 || !Number.isFinite(trade.solAmount) || trade.solAmount <= 0) return;
    const time = Math.floor(trade.blockTime / seconds) * seconds;
    const current = buckets.get(time);
    if (!current) {
      buckets.set(time, { time, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.solAmount });
      return;
    }
    current.high = Math.max(current.high, trade.price);
    current.low = Math.min(current.low, trade.price);
    current.close = trade.price;
    current.volume += trade.solAmount;
  });
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}
export function canUpdateLastCandle(previous, next) {
  if (!previous.length || next.length < previous.length || next.length > previous.length + 1) return false;
  return previous.every((bar, index) => index === previous.length - 1 ? bar.time === next[index].time
    : ['time', 'open', 'high', 'low', 'close', 'volume'].every(key => bar[key] === next[index][key]));
}
