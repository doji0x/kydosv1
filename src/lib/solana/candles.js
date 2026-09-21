export const TIMEFRAMES = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
];

export function bucketTrades(trades, seconds) {
  const buckets = new Map();
  [...trades].sort((a, b) => a.blockTime - b.blockTime).forEach(trade => {
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
  return [...buckets.values()];
}