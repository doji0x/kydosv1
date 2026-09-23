import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { MARKET_CATALOG } from '../base44/shared/marketCatalog.js';
import { CandleError, CHART_INTERVALS, chartInput, createCandleService, normalizeCandles, normalizePool } from '../base44/shared/marketCandles.js';
import { CANDLE_INTERVALS, candleQueryKey, mergeCandlePages, sparklinePath, validateCandlePage } from '../src/lib/marketCandles.js';

const TIME = 1_790_100_000_000, SOL = MARKET_CATALOG[0].mint, USDC = MARKET_CATALOG.at(-1).mint;
const POOL = `${'1'.repeat(31)}2`, WRONG_POOL = `${'1'.repeat(31)}3`;
const input = { mint: SOL, interval: '1h' };
function poolRow({ quote = false, address = POOL, mint = SOL, liquidity = '1000000' } = {}) {
  return { id: `solana_${address}`, attributes: { address, name: 'Fixture SOL / USDC', reserve_in_usd: liquidity }, relationships: { base_token: { data: { id: `solana_${quote ? USDC : mint}` } }, quote_token: { data: { id: `solana_${quote ? mint : USDC}` } }, dex: { data: { id: 'fixture-dex' } } } };
}
function entityFixture(initial = []) {
  const rows = [...initial], operations = []; let sequence = rows.length;
  return {
    rows, operations,
    filter: async (query, order, limit) => { operations.push(['filter', query]); return rows.filter(row => row.namespace === query.namespace && (!query.cache_key || row.cache_key === query.cache_key) && (!query.expires_at || row.expires_at < query.expires_at.$lt)).sort((a, b) => order === '-started_at' ? b.started_at - a.started_at : a.expires_at - b.expires_at).slice(0, limit); },
    create: async value => { const row = { ...value, id: `record-${sequence++}`, created_by: 'private-user' }; rows.push(row); operations.push(['create', value.cache_key]); return row; },
    delete: async id => { const index = rows.findIndex(row => row.id === id); if (index >= 0) rows.splice(index, 1); },
  };
}
function provider({ quote = false, count = 3 } = {}) {
  const calls = [], state = { fail: null, empty: false, mismatch: false, count };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (state.fail) return new Response('private upstream diagnostic', { status: state.fail, headers: { 'Retry-After': '120' } });
    const u = new URL(url);
    if (!u.pathname.includes('/ohlcv/')) return Response.json({ data: u.pathname.includes('/tokens/') ? [poolRow({ quote })] : poolRow({ quote }) });
    const unit = u.pathname.split('/').at(-1), seconds = ({ minute: 60, hour: 3600, day: 86400 })[unit] * Number(u.searchParams.get('aggregate'));
    const end = Math.floor(Number(u.searchParams.get('before_timestamp') || TIME / 1000) / seconds) * seconds;
    const rows = state.empty ? [] : Array.from({ length: state.count }, (_, index) => [end - index * seconds, 10, 12, 9, 11, index === 0 ? 0 : 100]);
    return Response.json({ data: { attributes: { ohlcv_list: rows } }, meta: { base: { address: state.mismatch ? WRONG_POOL : quote ? USDC : SOL }, quote: { address: quote ? SOL : USDC } } });
  };
  return { calls, state, fetchImpl };
}
const candle = (time, close = 11) => ({ time, open: 10, high: Math.max(12, close), low: 9, close, volume: 100 });

test('chart input is bounded, exact-mint and limited to supported resolutions', () => {
  assert.deepEqual(CANDLE_INTERVALS, Object.keys(CHART_INTERVALS));
  assert.deepEqual(chartInput(input, TIME), { ...input, pool: null, before: null });
  for (const value of [null, { ...input, mint: 'SOL' }, { ...input, interval: '__proto__' }, { ...input, pool: 'https://attacker.invalid' }, { ...input, before: TIME }, { ...input, before: 1000 }, { ...input, pool: POOL, before: -1 }]) assert.throws(() => chartInput(value, TIME), CandleError);
});
test('pool resolution verifies the exact relationship and requested token orientation', () => {
  assert.equal(normalizePool(poolRow(), SOL).tokenSide, 'base');
  assert.equal(normalizePool(poolRow({ quote: true }), SOL).tokenSide, 'quote');
  assert.equal(normalizePool(poolRow({ mint: WRONG_POOL }), SOL), null);
  assert.equal(normalizePool({ ...poolRow(), id: `ethereum_${POOL}` }, SOL), null);
});
test('candles are ordered, deduplicated and validated without filling empty buckets', () => {
  const end = Math.floor(TIME / 1000 / 3600) * 3600;
  const rows = [[end, 10, 12, 9, 11, 0], [end - 7200, 10, 13, 9, 12, 5], [end, 10, 12, 9, 11, 0], [end - 3600, 10, 8, 9, 11, 1], [end + 3600, 10, 12, 9, 11, 1]];
  const clean = normalizeCandles(rows, { interval: '1h', before: null }, TIME);
  assert.deepEqual(clean.map(bar => bar.time), [end - 7200, end]); assert.equal(clean.at(-1).volume, 0);
  assert.throws(() => normalizeCandles([[end, 0, 0, 0, 0, 0]], input, TIME), /no valid candles/);
  assert.deepEqual(normalizeCandles([], input, TIME), []);
});
test('initial chart obtains verified pool and real OHLCV using versioned bounded requests', async () => {
  const p = provider(), entity = entityFixture(), read = createCandleService({ ...p, now: () => TIME });
  const result = await read(entity, input);
  assert.equal(p.calls.length, 2); assert.equal(result.candles.length, 3); assert.equal(result.currency, 'USD');
  assert.equal(result.pool.address, POOL); assert.equal(result.hasMore, false); assert.equal(result.stale, false);
  const url = new URL(p.calls[1].url);
  assert.match(url.pathname, /\/pools\/.*\/ohlcv\/hour$/); assert.equal(url.searchParams.get('token'), 'base');
  assert.equal(url.searchParams.get('currency'), 'usd'); assert.equal(url.searchParams.get('include_empty_intervals'), 'false'); assert.equal(url.searchParams.get('limit'), '300');
  for (const call of p.calls) { assert.equal(call.init.redirect, 'manual'); assert.equal(call.init.headers.Accept, 'application/json;version=20230203'); }
  assert.ok(!JSON.stringify(result).includes('private-user'));
});
test('quote-side assets request provider inversion and keep the same pool during history', async () => {
  const p = provider({ quote: true, count: 300 }), entity = entityFixture(), read = createCandleService({ ...p, now: () => TIME });
  const first = await read(entity, input);
  assert.equal(new URL(p.calls[1].url).searchParams.get('token'), 'quote'); assert.equal(first.hasMore, true);
  const older = await read(entity, { ...input, pool: first.pool.address, before: first.nextBefore });
  assert.equal(p.calls.length, 3); assert.equal(older.pool.address, first.pool.address);
  assert.ok(older.candles.at(-1).time < first.candles[0].time);
  assert.equal(new URL(p.calls[2].url).searchParams.get('before_timestamp'), String(first.candles[0].time - 1));
});
test('shared durable cache serves a second function instance without provider calls', async () => {
  const p = provider(), entity = entityFixture();
  const first = await createCandleService({ ...p, now: () => TIME })(entity, input);
  const other = createCandleService({ fetchImpl: async () => { throw new Error('must not fetch'); }, now: () => TIME + 20_000 });
  const second = await other(entity, input);
  assert.deepEqual(second, first); assert.ok(!JSON.stringify(second).includes('created_by'));
});
test('in-process requests coalesce before pool resolution and publication', async () => {
  const p = provider(), entity = entityFixture(), read = createCandleService({ ...p, now: () => TIME });
  const values = await Promise.all([read(entity, input), read(entity, input), read(entity, input)]);
  assert.equal(p.calls.length, 2); assert.deepEqual(values[0], values[2]);
  assert.equal(entity.rows.filter(row => row.cache_key.startsWith('candles:')).length, 1);
});
test('automatic and pinned pool requests share one expired candle refresh', async () => {
  const p = provider(), entity = entityFixture(); let time = TIME;
  const read = createCandleService({ ...p, now: () => time });
  await read(entity, input); time += 61_000; p.calls.length = 0;
  const results = await Promise.all([
    read(entity, input), read(entity, { ...input, pool: POOL }), read(entity, input),
  ]);
  assert.equal(p.calls.length, 1);
  assert.match(p.calls[0].url, /\/ohlcv\/hour\?/);
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  assert.equal(entity.rows.filter(row => row.cache_key.startsWith('candles:')).length, 2);
});
test('resolved coalescing keeps different pools, intervals and history pages separate', async () => {
  const p = provider(), entity = entityFixture(); let time = TIME;
  const fetchImpl = async (url, init) => {
    if (new URL(url).pathname.endsWith(`/pools/${WRONG_POOL}`)) {
      p.calls.push({ url, init });
      return Response.json({ data: poolRow({ address: WRONG_POOL }) });
    }
    return p.fetchImpl(url, init);
  };
  const read = createCandleService({ fetchImpl, now: () => time });
  await read(entity, input); time += 61_000; p.calls.length = 0;
  const before = Math.floor(TIME / 1000 / 3600) * 3600 - 1;
  const [latest, otherPool, otherInterval, older] = await Promise.all([
    read(entity, input), read(entity, { ...input, pool: WRONG_POOL }),
    read(entity, { ...input, pool: POOL, interval: '5m' }), read(entity, { ...input, pool: POOL, before }),
  ]);
  const requests = p.calls.filter(call => call.url.includes('/ohlcv/'));
  assert.equal(requests.length, 4); assert.equal(new Set(requests.map(call => call.url)).size, 4);
  assert.equal(latest.pool.address, POOL); assert.equal(otherPool.pool.address, WRONG_POOL);
  assert.equal(otherInterval.interval, '5m'); assert.equal(older.before, before);
  assert.ok(older.candles.at(-1).time < latest.candles.at(-1).time);
});
test('repeated refreshes retain only the latest two candle generations', async () => {
  const p = provider(), entity = entityFixture(); let time = TIME;
  const read = createCandleService({ ...p, now: () => time });
  for (let refresh = 0; refresh < 5; refresh++) { await read(entity, input); time += 61_000; }
  const generations = entity.rows.filter(row => row.cache_key.startsWith('candles:'));
  assert.equal(generations.length, 2);
  assert.deepEqual(generations.map(row => row.started_at), [TIME + 3 * 61_000, TIME + 4 * 61_000]);
  p.state.fail = 500;
  assert.equal((await read(entity, input)).fetchedAt, TIME + 4 * 61_000);
});
test('failures preserve historical candles and the original fetched timestamp', async () => {
  const p = provider(), entity = entityFixture(); let time = TIME;
  const read = createCandleService({ ...p, now: () => time });
  const good = await read(entity, input); time += 61_000; p.state.fail = 500;
  const delayed = await read(entity, input);
  assert.equal(delayed.stale, true); assert.equal(delayed.fetchedAt, good.fetchedAt); assert.deepEqual(delayed.candles, good.candles);
  assert.equal(entity.rows.filter(row => row.cache_key.startsWith('candles:')).length, 1);
  assert.ok(!delayed.warning.includes('private upstream'));
});
test('an unexpected empty update cannot replace existing good candles', async () => {
  const p = provider(), entity = entityFixture(); let time = TIME;
  const read = createCandleService({ ...p, now: () => time });
  await read(entity, input); time += 61_000; p.state.empty = true;
  const result = await read(entity, input);
  assert.equal(result.stale, true); assert.equal(result.candles.length, 3); assert.equal(result.fetchedAt, TIME);
});
test('429 cooldown is persisted and honored by a separate function instance', async () => {
  const p = provider(), entity = entityFixture(); p.state.fail = 429;
  await assert.rejects(createCandleService({ ...p, now: () => TIME })(entity, input), error => error.status === 429 && error.retryAfter === 120);
  const other = provider();
  await assert.rejects(createCandleService({ ...other, now: () => TIME + 1000 })(entity, input), error => error.status === 429);
  assert.equal(other.calls.length, 0);
});
test('admission control limits upstream calls within each instance', async () => {
  const p = provider(), entity = entityFixture(), read = createCandleService({ ...p, now: () => TIME, requestsPerMinute: 2 });
  await read(entity, input);
  await assert.rejects(read(entity, { ...input, interval: '5m' }), error => error.status === 429);
  assert.equal(p.calls.length, 2);
});
test('pool mismatch, provider HTTP errors and transport details never become candles', async () => {
  const p = provider(); p.state.mismatch = true;
  await assert.rejects(createCandleService({ ...p, now: () => TIME })(entityFixture(), input), /identity did not match/);
  for (const status of [302, 307, 403, 404, 500]) {
    const fake = provider(); fake.state.fail = status;
    await assert.rejects(createCandleService({ ...fake, now: () => TIME })(entityFixture(), input), error => error instanceof CandleError && !error.message.includes('private'));
  }
  await assert.rejects(createCandleService({ fetchImpl: async () => { throw new Error('secret=https://internal.invalid'); }, now: () => TIME })(entityFixture(), input), error => error.message === 'The chart provider could not be reached.');
});
test('provider response byte limits are enforced before parsing', async () => {
  const read = createCandleService({ fetchImpl: async () => new Response('{}', { headers: { 'content-length': '1000001' } }), now: () => TIME });
  await assert.rejects(read(entityFixture(), input), /size limit/);
});
test('client rejects changed mint, pool, denomination and non-progressing history cursors', async () => {
  const page = await createCandleService({ ...provider({ count: 300 }), now: () => TIME })(entityFixture(), input);
  assert.equal(validateCandlePage(page, input), page);
  for (const override of [{ mint: USDC }, { currency: 'SOL' }, { volumeCurrency: 'SOL' }, { nextBefore: page.candles[0].time }, { candles: [...page.candles].reverse() }]) assert.throws(() => validateCandlePage({ ...page, ...override }, input));
  assert.throws(() => validateCandlePage(page, { ...input, pool: WRONG_POOL }));
  assert.notDeepEqual(candleQueryKey(SOL, '1h'), candleQueryKey(USDC, '1h'));
});
test('newer candle corrections replace overlaps while older history remains intact', () => {
  const before = [candle(3600), candle(7200)], latest = [candle(7200, 12), candle(10800)];
  assert.deepEqual(mergeCandlePages(before, latest).map(bar => [bar.time, bar.close]), [[3600, 11], [7200, 12], [10800, 11]]);
});
test('sparklines use historical closes, tolerate flat prices and leave trading gaps', () => {
  const last = Math.floor(TIME / 1000 / 3600) * 3600;
  assert.equal(sparklinePath([], TIME), null); assert.equal(sparklinePath([candle(last)], TIME), null);
  assert.equal(sparklinePath([candle(last - 200000), candle(last - 190000)], TIME), null);
  const flat = sparklinePath([candle(last - 3600), candle(last)], TIME);
  assert.match(flat.path, /^M0.00,20.00 L160.00,20.00$/);
  const gaps = sparklinePath([candle(last - 10800), candle(last)], TIME);
  assert.equal(gaps.path.includes('L'), false);
});

const handlerSource = ts.transpile(readFileSync(new URL('../base44/functions/marketCandles/entry.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }).replace(/^import .*;\n/gm, '').replace('export default async function', 'return async function');
function handlerFixture({ listed = true } = {}) {
  let called = 0;
  const client = { asServiceRole: { entities: { MarketChartCache: entityFixture(), MarketDiscoverySnapshot: {} } } };
  const factory = new Function('createClientFromRequest', 'MARKET_CATALOG', 'latestSnapshot', 'CandleError', 'chartInput', 'createCandleService', handlerSource);
  const handler = factory(() => client, listed ? MARKET_CATALOG : [], async () => ({ tokens: [] }), CandleError, chartInput, () => async () => { called++; return { candles: [], currency: 'USD' }; });
  return { handler, calls: () => called };
}
test('actual endpoint permits anonymous catalog charts but bounds unknown mints and input', async () => {
  const f = handlerFixture(), request = body => new Request('https://example.invalid/marketCandles', { method: 'POST', body });
  assert.equal((await f.handler(request(JSON.stringify(input)))).status, 200); assert.equal(f.calls(), 1);
  for (const body of ['{bad', 'x'.repeat(2000), JSON.stringify({ ...input, interval: '1s' })]) assert.equal((await f.handler(request(body))).status, 400);
  assert.equal(f.calls(), 1);
  const unknown = handlerFixture({ listed: false });
  assert.equal((await unknown.handler(request(JSON.stringify(input)))).status, 404); assert.equal(unknown.calls(), 0);
  assert.equal((await f.handler(new Request('https://example.invalid'))).status, 405);
});
