// Canonical price construction.
//
// A single pool's price is not the token's price: a few hundred dollars of liquidity in
// a spoofed pool must not be able to move what Kydos reports. Quotes are filtered by a
// liquidity floor, screened against the median, then liquidity-weighted into one price.

export const MIN_POOL_LIQUIDITY_USD = 1_000;
export const MAX_MEDIAN_DEVIATION = 0.25; // 25% away from the median = rejected

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const usable = (q) =>
  q && isFinite(q.price_usd) && q.price_usd > 0 && isFinite(q.price_quote) && q.price_quote > 0;

/**
 * @param {Array<{pool: string, price_usd: number, price_quote: number, liquidity_usd: number}>} quotes
 * @returns {null | {price_usd, price_quote, pools_used, pools_rejected, deepest_pool, low_liquidity_only}}
 */
export function canonicalPrice(quotes) {
  const valid = (quotes || []).filter(usable);
  if (!valid.length) return null;

  // Prefer pools that clear the liquidity floor; fall back to thin pools only when
  // nothing else exists, and flag that the price is low-confidence.
  const deep = valid.filter((q) => (q.liquidity_usd || 0) >= MIN_POOL_LIQUIDITY_USD);
  const pool = deep.length ? deep : valid;
  const lowLiquidityOnly = !deep.length;

  const mid = median(pool.map((q) => q.price_usd));
  const kept = pool.filter((q) => Math.abs(q.price_usd - mid) / mid <= MAX_MEDIAN_DEVIATION);
  const survivors = kept.length ? kept : pool;

  // Weight by liquidity so the deepest market dominates; a floor of 1 keeps
  // zero-liquidity quotes from producing a divide-by-zero.
  const weight = (q) => Math.max(q.liquidity_usd || 0, 1);
  const total = survivors.reduce((sum, q) => sum + weight(q), 0);
  const priceUsd = survivors.reduce((sum, q) => sum + q.price_usd * weight(q), 0) / total;
  const priceQuote = survivors.reduce((sum, q) => sum + q.price_quote * weight(q), 0) / total;

  const deepest = survivors.reduce((best, q) =>
    (q.liquidity_usd || 0) > (best.liquidity_usd || 0) ? q : best
  );

  return {
    price_usd: priceUsd,
    price_quote: priceQuote,
    pools_used: survivors.length,
    pools_rejected: valid.length - survivors.length,
    deepest_pool: deepest.pool || null,
    low_liquidity_only: lowLiquidityOnly,
  };
}