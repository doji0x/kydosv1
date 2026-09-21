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

// Dust transfers have meaningless execution prices and must never move a public chart.
export function isUsableTrade(t) {
  return Number.isFinite(t?.price_usd) && t.price_usd > 0
    && Number.isFinite(t?.volume_usd) && t.volume_usd >= 0.01
    && Number.isFinite(t?.token_amount) && t.token_amount > 0
    && Number.isFinite(t?.block_time) && t.block_time > 0;
}

// Rolls verified, transaction-deduplicated trades into OHLCV buckets.
export function rollCandles(trades, intervalMs) {
  const byBucket = new Map();
  const seen = new Set();
  const sorted = [...trades].sort((a, b) =>
    (a.block_time || 0) - (b.block_time || 0)
    || (a.block_number || 0) - (b.block_number || 0)
    || (a.log_index || 0) - (b.log_index || 0)
  );
  for (const t of sorted) {
    if (!isUsableTrade(t)) continue;
    const keyId = t.uid || `${t.tx_hash || ""}-${t.log_index ?? ""}`;
    if (keyId && seen.has(keyId)) continue;
    if (keyId) seen.add(keyId);
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