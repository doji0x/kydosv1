import { isSolanaMint, MARKET_CATALOG } from './marketCatalog.js';
import { CANDLE_SECONDS, mergeStoredCandles } from './jupiterCandleMath.js';
export const CANDLE_LIMIT = 300;
export class CandleError extends Error {
  constructor(code, message, status = 503, retryAfter = 60) { super(message); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
export function chartInput(input, now = Date.now()) {
  if (!input || !isSolanaMint(input.mint) || !Object.hasOwn(CANDLE_SECONDS, input.interval)) throw new CandleError('invalid_input', 'A valid Solana mint and supported candle interval are required.', 400);
  // The legacy pool field now pins the mint-keyed Jupiter stream, not an exchange pool.
  if (input.pool != null && input.pool !== input.mint) throw new CandleError('invalid_input', 'This chart uses the mint-keyed Jupiter price stream.', 400);
  if (input.before != null && (!Number.isSafeInteger(input.before) || input.before < 1 || input.before > Math.floor(now / 1000))) throw new CandleError('invalid_input', 'Invalid history cursor.', 400);
  return { mint: input.mint, interval: input.interval, pool: input.mint, before: input.before ?? null };
}
export async function noteChartInterest(entity, mint, now = Date.now()) {
  if (MARKET_CATALOG.some(token => token.mint === mint)) return;
  const [row] = await entity.filter({ mint }, '-viewed_at', 1);
  if (row && now - row.viewed_at < 300000 && row.viewed_at <= now) return;
  if (row) await entity.update(row.id, { viewed_at: now }); else await entity.create({ mint, viewed_at: now });
}
export async function readJupiterCandles(entity, input, now = Date.now()) {
  const filter = { mint: input.mint, interval: input.interval, ...(input.before ? { open_time: { $lte: input.before } } : {}) };
  const rows = await entity.filter(filter, '-open_time', CANDLE_LIMIT + 1), grouped = new Map();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.open_time) || row.open_time > now / 1000 || row.open_time % CANDLE_SECONDS[input.interval] ||
      ![row.open, row.high, row.low, row.close].every(value => Number.isFinite(value) && value > 0) || row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close)) continue;
    const group = grouped.get(row.open_time) || []; group.push(row); grouped.set(row.open_time, group);
  }
  const bars = [...grouped.values()].map(mergeStoredCandles).sort((a, b) => b.open_time - a.open_time).slice(0, CANDLE_LIMIT).reverse();
  const fetchedAt = bars.length ? Math.max(...bars.map(bar => bar.last_sample_at)) : 0;
  const hasMore = rows.length > CANDLE_LIMIT && bars.length > 0, stale = !!bars.length && !input.before && now - fetchedAt > 120000;
  return { network: 'solana-mainnet', mint: input.mint, interval: input.interval, before: input.before,
    pool: { address: input.mint, name: 'Jupiter sampled price', kind: 'aggregate' },
    candles: bars.map(bar => ({ time: bar.open_time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: null })),
    currency: 'USD', volumeCurrency: 'USD', volumeAvailable: false, source: 'Jupiter Price V3 · sampled', sampled: true, fetchedAt,
    hasMore, nextBefore: hasMore ? bars[0].open_time - 1 : null, stale,
    warning: stale ? 'The latest stored sample is over two minutes old.' : null,
    historyStartedAt: bars[0]?.first_sample_at ?? null };
}