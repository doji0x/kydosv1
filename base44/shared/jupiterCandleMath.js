export const CANDLE_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
export function mergeStoredCandles(rows) {
  const sorted = [...rows].sort((a, b) => a.first_sample_at - b.first_sample_at || String(a.id).localeCompare(String(b.id)));
  const first = sorted[0]; if (!first) return null;
  const last = [...sorted].sort((a, b) => b.last_sample_at - a.last_sample_at)[0];
  return { ...first, high: Math.max(...sorted.map(row => row.high)), low: Math.min(...sorted.map(row => row.low)), close: last.close,
    last_sample_at: last.last_sample_at, last_block_id: last.last_block_id, sample_count: Math.max(...sorted.map(row => row.sample_count)),
    is_closed: sorted.some(row => row.is_closed), volume: null };
}
export function nextSampleCandle(previous, mint, interval, sample, observedAt) {
  const seconds = CANDLE_SECONDS[interval], openTime = Math.floor(observedAt / 1000 / seconds) * seconds;
  if (!seconds || !Number.isFinite(sample?.price) || sample.price <= 0) return null;
  if (previous && (previous.is_closed || previous.open_time !== openTime || previous.last_sample_at >= observedAt ||
    sample.blockId != null && previous.last_block_id != null && sample.blockId < previous.last_block_id)) return null;
  return { mint, interval, open_time: openTime, open: previous?.open ?? sample.price,
    high: Math.max(previous?.high ?? sample.price, sample.price), low: Math.min(previous?.low ?? sample.price, sample.price), close: sample.price,
    volume: null, is_closed: false, first_sample_at: previous?.first_sample_at ?? observedAt, last_sample_at: observedAt,
    sample_count: (previous?.sample_count || 0) + 1, last_block_id: sample.blockId };
}