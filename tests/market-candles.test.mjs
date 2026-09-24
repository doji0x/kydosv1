import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_CATALOG } from '../base44/shared/marketCatalog.js';
import { CandleError, chartInput, readJupiterCandles } from '../base44/shared/marketCandles.js';
import { nextSampleCandle } from '../base44/shared/jupiterCandleMath.js';
import { validateCandlePage } from '../src/lib/marketCandles.js';

const mint = MARKET_CATALOG[0].mint, first = 1790232480000;
test('chart requests validate mint, interval, cursor and stream identity', () => {
  assert.deepEqual(chartInput({ mint, interval: '1m' }, first), { mint, interval: '1m', pool: mint, before: null });
  for (const bad of [{ mint: 'SOL', interval: '1m' }, { mint, interval: '2m' }, { mint, interval: '1m', pool: 'different' }, { mint, interval: '1m', before: first }]) assert.throws(() => chartInput(bad, first), CandleError);
});
test('samples produce honest OHLC with no synthetic volume or repeated minute samples', () => {
  const quote = { price: 10, blockId: 100 }, initial = nextSampleCandle(null, mint, '5m', quote, first);
  assert.equal(initial.open, 10); assert.equal(initial.volume, null); assert.equal(initial.sample_count, 1);
  assert.equal(nextSampleCandle(initial, mint, '5m', { price: 12, blockId: 101 }, first + 30000), null);
  const second = nextSampleCandle(initial, mint, '5m', { price: 12, blockId: 101 }, first + 60000);
  assert.equal(second.high, 12); assert.equal(second.close, 12); assert.equal(second.sample_count, 2);
  assert.equal(nextSampleCandle(second, mint, '5m', { price: 8, blockId: 99 }, first + 120000), null);
});
test('chart reads exact mint and interval; volume remains unavailable', async () => {
  const firstBar = nextSampleCandle(null, mint, '1m', { price: 10, blockId: 1 }, first);
  const rows = [{ ...firstBar, id: 'candle-1' }];
  const entity = { filter: async query => rows.filter(row => row.mint === query.mint && row.interval === query.interval) };
  const input = chartInput({ mint, interval: '1m' }, first + 60000);
  const page = await readJupiterCandles(entity, input, first + 60000);
  assert.equal(page.candles.length, 1); assert.equal(page.candles[0].volume, null); assert.equal(page.volumeAvailable, false);
  assert.equal(validateCandlePage(page, input), page);
});