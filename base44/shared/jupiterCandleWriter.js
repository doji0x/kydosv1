import { MARKET_CATALOG, isSolanaMint } from './marketCatalog.js';
import { CANDLE_SECONDS, mergeStoredCandles, nextSampleCandle } from './jupiterCandleMath.js';
import { fetchJupiterPrices } from './jupiterPrices.js';

async function batches(items, run) {
  for (let offset = 0; offset < items.length; offset += 500) await run(items.slice(offset, offset + 500));
}
export async function writeJupiterCandles(entities, prices, observedAt) {
  const mints = Object.keys(prices).filter(isSolanaMint);
  const frames = Object.entries(CANDLE_SECONDS);
  const openSets = await Promise.all(frames.map(([interval]) => entities.JupiterCandle.filter({ interval, is_closed: false }, '-open_time', 500)));
  const creates = [], updates = [], duplicateIds = [];
  for (const [index, [interval, seconds]] of frames.entries()) {
    const bucket = Math.floor(observedAt / 1000 / seconds) * seconds, grouped = new Map();
    for (const row of openSets[index]) {
      if (row.open_time < bucket) { updates.push({ id: row.id, is_closed: true }); continue; }
      if (row.open_time !== bucket) continue;
      const list = grouped.get(row.mint) || []; list.push(row); grouped.set(row.mint, list);
    }
    for (const mint of mints) {
      const rows = grouped.get(mint) || [], previous = mergeStoredCandles(rows);
      const next = nextSampleCandle(previous, mint, interval, prices[mint], observedAt);
      if (next) {
        if (previous) updates.push({ id: previous.id, ...next }); else creates.push(next);
      }
      // A single workflow is the writer. Heal any duplicate bucket left by an interrupted retry.
      if (rows.length > 1) {
        if (!next) { const { id, high, low, close, last_sample_at, last_block_id, sample_count } = previous; updates.push({ id, high, low, close, last_sample_at, last_block_id, sample_count }); }
        duplicateIds.push(...rows.filter(row => row.id !== previous.id).map(row => row.id));
      }
    }
  }
  await batches(updates, rows => entities.JupiterCandle.bulkUpdate(rows));
  await batches(creates, rows => entities.JupiterCandle.bulkCreate(rows));
  await batches(duplicateIds, ids => entities.JupiterCandle.deleteMany({ id: { $in: ids } }));
  return { sampledAt: observedAt, requested: mints.length, priced: mints.filter(mint => prices[mint]).length, missing: mints.filter(mint => !prices[mint]), created: creates.length, updated: updates.length };
}
export async function pollJupiterCandles(entities, apiKey, now = Date.now, fetchImpl = fetch) {
  const startedAt = now();
  const interests = await entities.MarketChartInterest.filter({ viewed_at: { $gte: startedAt - 86400000, $lte: startedAt } }, '-viewed_at', 500);
  const recent = [...new Set(interests.map(row => row.mint).filter(isSolanaMint))].slice(0, 100);
  const mints = [...new Set([...MARKET_CATALOG.map(token => token.mint), ...recent])];
  const prices = await fetchJupiterPrices(mints, { apiKey, fetchImpl });
  const result = await writeJupiterCandles(entities, Object.fromEntries(mints.map(mint => [mint, prices[mint]])), now());
  await entities.MarketChartInterest.deleteMany({ viewed_at: { $lt: startedAt - 86400000 } });
  return result;
}