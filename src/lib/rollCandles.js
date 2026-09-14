// Client-side OHLCV bucketing for the live stream.
//
// Sub-minute bars (1s/5s/15s) are never persisted — a single token would produce 86,400
// one-second bars a day. They are rolled here from live trades and kept in memory only.

export const CLIENT_INTERVALS = {
  "1s": 1_000,
  "5s": 5_000,
  "15s": 15_000,
};

export const SERVER_INTERVALS = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

export const INTERVAL_MS = { ...CLIENT_INTERVALS, ...SERVER_INTERVALS };
export const INTERVAL_KEYS = Object.keys(INTERVAL_MS);
export const isClientInterval = (i) => i in CLIENT_INTERVALS;

export const bucketStart = (ts, ms) => Math.floor(ts / ms) * ms;

// The market API publishes a swap's time as `timestamp`; entity records call it `block_time`.
// Both reach the chart, so always read the time through here.
export const tradeTime = (t) => t.block_time || t.timestamp || 0;

function emptyBar(t, price) {
  return { t, open: price, high: price, low: price, close: price, volume_usd: 0, trades: 0 };
}

/**
 * Folds one trade into a bar series, returning a new array (the last bar is the one
 * still forming). Trades landing in an older bucket than the tail are ignored.
 */
export function applyTrade(bars, trade, ms, maxBars = 5000) {
  const price = trade.price_usd;
  if (!price || !isFinite(price)) return bars;
  const t = bucketStart(tradeTime(trade) || Date.now(), ms);
  const next = bars.slice();
  const tail = next[next.length - 1];

  if (!tail || t > tail.t) {
    const bar = emptyBar(t, price);
    // Carry the previous close so a new bucket opens where the last one left off.
    if (tail) bar.open = tail.close;
    bar.high = Math.max(bar.open, price);
    bar.low = Math.min(bar.open, price);
    bar.volume_usd = trade.volume_usd || 0;
    bar.trades = 1;
    next.push(bar);
  } else if (t === tail.t) {
    next[next.length - 1] = {
      ...tail,
      high: Math.max(tail.high, price),
      low: Math.min(tail.low, price),
      close: price,
      volume_usd: (tail.volume_usd || 0) + (trade.volume_usd || 0),
      trades: (tail.trades || 0) + 1,
    };
  } else {
    return bars;
  }

  return next.length > maxBars ? next.slice(next.length - maxBars) : next;
}

/**
 * Advances the series to `now` so an idle market still draws flat bars instead of a gap.
 */
export function fillIdle(bars, ms, now = Date.now(), maxBars = 5000) {
  if (!bars.length) return bars;
  const target = bucketStart(now, ms);
  const tail = bars[bars.length - 1];
  if (target <= tail.t) return bars;
  // Long idle stretches are capped so we never build thousands of flat bars at once.
  const gaps = Math.min((target - tail.t) / ms, 240);
  const next = bars.slice();
  for (let i = 1; i <= gaps; i++) {
    const t = tail.t + i * ms;
    const prev = next[next.length - 1];
    next.push({ t, open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume_usd: 0, trades: 0 });
  }
  return next.length > maxBars ? next.slice(next.length - maxBars) : next;
}

/**
 * Fills quiet stretches *between* bars with flat carry-forward bars, so a sparse market draws
 * a continuous line instead of candles floating at arbitrary distances. Runs longer than
 * `maxRun` buckets are left as a single jump rather than thousands of empty bars.
 */
export function fillGaps(bars, ms, maxRun = 400) {
  if (bars.length < 2) return bars;
  const out = [bars[0]];
  for (let i = 1; i < bars.length; i++) {
    const prev = out[out.length - 1];
    const gaps = (bars[i].t - prev.t) / ms - 1;
    if (gaps > 0 && gaps <= maxRun) {
      for (let g = 1; g <= gaps; g++) {
        const t = prev.t + g * ms;
        const c = out[out.length - 1].close;
        out.push({ t, open: c, high: c, low: c, close: c, volume_usd: 0, trades: 0 });
      }
    }
    out.push(bars[i]);
  }
  return out;
}

/** Seeds an empty sub-minute series from a single known price. */
export function seedSeries(price, ms, count = 40, now = Date.now()) {
  if (!price || !isFinite(price)) return [];
  const start = bucketStart(now, ms) - (count - 1) * ms;
  return Array.from({ length: count }, (_, i) => emptyBar(start + i * ms, price));
}