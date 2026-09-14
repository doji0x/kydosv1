// Market math: derives every published stat from Kydos-indexed RhTrade records.

export function pctChange(from, to) {
  if (!from || !to) return 0;
  return ((to - from) / from) * 100;
}

// trades must be sorted newest-first and carry block_time + price_usd + volume_usd.
export function computeStats(trades, { totalSupply, liquidityUsd, refPriceUsd }) {
  const now = Date.now();
  const dayAgo = now - 86_400_000;
  const sixAgo = now - 6 * 3_600_000;
  const hourAgo = now - 3_600_000;

  const latest = trades[0] || null;
  const priceUsd = latest?.price_usd || 0;
  const priceQuote = latest?.price_quote || 0;

  const window24 = trades.filter((t) => (t.block_time || 0) >= dayAgo);
  const volume24 = window24.reduce((sum, t) => sum + (t.volume_usd || 0), 0);
  const buys = window24.filter((t) => t.side === "buy").length;
  const sells = window24.filter((t) => t.side === "sell").length;

  // Price as of each lookback boundary = the last fill at or before that instant.
  const priceAt = (ts) => {
    const t = trades.find((x) => (x.block_time || 0) <= ts && x.price_usd);
    return t?.price_usd || 0;
  };

  const fdv = totalSupply ? priceUsd * totalSupply : 0;

  return {
    price_usd: priceUsd,
    price_quote: priceQuote,
    fdv,
    market_cap: fdv,
    volume_24h: volume24,
    liquidity_usd: liquidityUsd || 0,
    change_1h: pctChange(priceAt(hourAgo), priceUsd),
    change_6h: pctChange(priceAt(sixAgo), priceUsd),
    change_24h: pctChange(priceAt(dayAgo), priceUsd),
    buys_24h: buys,
    sells_24h: sells,
    trades_24h: window24.length,
    ref_price_usd: refPriceUsd || 0,
    stats_updated_at: now,
  };
}

export function bucketStart(ts, intervalMs) {
  return Math.floor(ts / intervalMs) * intervalMs;
}

// Rolls trades (any order) into OHLCV buckets keyed by bucket start.
export function rollCandles(trades, intervalMs) {
  const byBucket = new Map();
  const sorted = [...trades].sort((a, b) => (a.block_time || 0) - (b.block_time || 0));
  for (const t of sorted) {
    if (!t.price_usd || !t.block_time) continue;
    const key = bucketStart(t.block_time, intervalMs);
    const bar = byBucket.get(key);
    if (!bar) {
      byBucket.set(key, {
        bucket_start: key,
        open: t.price_usd,
        high: t.price_usd,
        low: t.price_usd,
        close: t.price_usd,
        volume_usd: t.volume_usd || 0,
        trades: 1,
      });
    } else {
      bar.high = Math.max(bar.high, t.price_usd);
      bar.low = Math.min(bar.low, t.price_usd);
      bar.close = t.price_usd;
      bar.volume_usd += t.volume_usd || 0;
      bar.trades += 1;
    }
  }
  return [...byBucket.values()].sort((a, b) => a.bucket_start - b.bucket_start);
}