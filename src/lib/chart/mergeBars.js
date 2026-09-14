// Bar-series merging for the chart.
//
// History arrives from two sources — the indexed candle store and raw on-chain swap
// scans — so series must be combined by bucket rather than blindly concatenated.

/** Prepends older bars to a live series, never overwriting a bar the stream already owns. */
export function prependBars(older, current) {
  if (!older?.length) return current;
  if (!current?.length) return [...older];
  const firstT = current[0].t;
  const head = older.filter((b) => b.t < firstT).sort((a, b) => a.t - b.t);
  return head.length ? [...head, ...current] : current;
}

/**
 * Full merge of two bar series at the same interval, deduped by bucket start.
 * On a collision the bar with real trades wins; ties keep the first series (indexed).
 */
export function mergeSeries(a = [], b = []) {
  if (!a.length) return [...b];
  if (!b.length) return [...a];
  const byBucket = new Map();
  for (const bar of a) byBucket.set(bar.t, bar);
  for (const bar of b) {
    const existing = byBucket.get(bar.t);
    if (!existing || (bar.trades || 0) > (existing.trades || 0)) byBucket.set(bar.t, bar);
  }
  return [...byBucket.values()].sort((x, y) => x.t - y.t);
}