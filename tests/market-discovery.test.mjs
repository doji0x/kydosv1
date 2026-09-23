import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { MARKET_CATALOG, MARKET_INTERVALS, MARKET_SCOPE, isSolanaMint, snapshotStatus } from '../base44/shared/marketCatalog.js';
import { fetchMarketSnapshot, normalizeJupiterToken, sanitizeSnapshot, safeIcon, MarketProviderError } from '../base44/shared/jupiterMarkets.js';
import { canRefreshMarkets, createMarketRefresher, readMarketDiscovery, emptySnapshot } from '../base44/shared/marketDiscovery.js';
import { fallbackSnapshot, formatChange, formatCompact, formatPrice, marketPath, parseWatchlist, readMarketOptions, selectMarkets, toggleSavedMarket } from '../src/lib/markets.js';

const SOL = MARKET_CATALOG[0].mint, BTC = MARKET_CATALOG[1].mint, ETH = MARKET_CATALOG[2].mint;
const TIME = 1_790_100_000_000;
const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const fixtureMint = suffix => `${'1'.repeat(31)}${suffix}`;
const firstUnknown = fixtureMint('2'), secondUnknown = fixtureMint('3');
function rawToken(id = SOL, overrides = {}) {
  return { id, name: 'Fixture coin', symbol: 'FIX', decimals: 9, tokenProgram: PROGRAM, usdPrice: 123.45, liquidity: 123456, mcap: 900000, fdv: 1000000, holderCount: 1000, isVerified: true, updatedAt: new Date(TIME - 1000).toISOString(), ...Object.fromEntries(MARKET_INTERVALS.map(interval => [`stats${interval}`, { priceChange: 1.25, buyVolume: 200, sellVolume: 300, volumeChange: 999, numBuys: 2, numSells: 3, numTraders: 4 }])), ...overrides };
}
function provider({ failAt = 0, status = 503, rows = [rawToken()] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return calls.length === failAt ? new Response('provider detail must stay private', { status }) : Response.json(rows);
  };
  return { calls, fetchImpl };
}
const fetchFixture = async options => fetchMarketSnapshot({ apiKey: 'test-key-only', now: () => TIME, pause: async () => {}, ...options });
function entityFixture(initial = []) {
  const rows = [...initial], calls = [];
  return {
    rows, calls,
    filter: async (filter, sort, limit) => { calls.push(['filter', filter, sort, limit]); return rows.filter(row => row.scope === filter.scope && (!filter.fetched_at || row.fetched_at < filter.fetched_at.$lt)).sort((a, b) => sort.startsWith('-') ? b.started_at - a.started_at : a.started_at - b.started_at).slice(0, limit); },
    create: async value => { calls.push(['create']); const row = { ...value, id: `row-${rows.length}`, created_by: 'private-admin@example.invalid' }; rows.push(row); return row; },
    delete: async id => { calls.push(['delete', id]); const index = rows.findIndex(row => row.id === id); if (index >= 0) rows.splice(index, 1); },
  };
}
const record = (snapshot, startedAt = snapshot.fetchedAt) => ({ scope: MARKET_SCOPE, started_at: startedAt, fetched_at: snapshot.fetchedAt, payload_json: JSON.stringify(snapshot) });

test('catalog uses exact unique 32-byte identities and explicit native/wrapped labels', () => {
  assert.equal(new Set(MARKET_CATALOG.map(token => token.mint)).size, 13);
  assert.equal(MARKET_CATALOG.filter(token => token.featured).length, 6);
  for (const token of MARKET_CATALOG) { assert.equal(isSolanaMint(token.mint), true, token.symbol); assert.match(token.source, /^https:\/\//); }
  assert.equal(MARKET_CATALOG[0].kind, 'native'); assert.match(MARKET_CATALOG[1].wrapper, /Coinbase/); assert.match(MARKET_CATALOG[2].wrapper, /Wormhole/);
  for (const bad of ['', 'SOL', '0'.repeat(44), '1'.repeat(31), '1'.repeat(33), '2'.repeat(32), 'z'.repeat(44)]) assert.equal(isSolanaMint(bad), false);
});
test('normalization preserves zero, missing data and native provider percentage units', () => {
  const token = normalizeJupiterToken(rawToken(SOL, { stats5m: { priceChange: -1.25, buyVolume: 0, sellVolume: 0, volumeChange: 800 }, stats1h: { buyVolume: 4 }, usdPrice: 0, liquidity: NaN }));
  assert.equal(token.stats['5m'].priceChange, -1.25); assert.equal(token.stats['5m'].volume, 0); assert.equal(token.stats['1h'].volume, null);
  assert.equal(token.stats['24h'].volume, 500); assert.equal(token.price, null); assert.equal(token.liquidity, null); assert.equal(token.stats['5m'].buys, null);
  assert.equal(normalizeJupiterToken(rawToken(SOL, { decimals: 6 })).decimals, 6);
});
test('mint identity wins over symbols, wrapped asset caps are omitted, invalid programs rejected', () => {
  const btc = normalizeJupiterToken(rawToken(BTC, { name: 'Impersonator', symbol: 'NOTBTC' }));
  assert.equal(btc.symbol, 'cbBTC'); assert.equal(btc.marketCap, null); assert.equal(btc.fdv, null);
  assert.equal(normalizeJupiterToken(rawToken(ETH)).marketCap, null);
  assert.equal(normalizeJupiterToken(rawToken('not-a-mint')), null);
  assert.equal(normalizeJupiterToken(rawToken(SOL, { tokenProgram: 'unknown' })), null);
  assert.equal(normalizeJupiterToken(rawToken(SOL, { decimals: -1 })), null);
});
test('untrusted icon URLs are bounded HTTPS URLs without credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:image/png,abc', 'http://example.com/icon', 'https://user:pass@example.com/icon', 'https://example.com/' + 'x'.repeat(3000)]) assert.equal(safeIcon(url), null);
  assert.equal(safeIcon('https://example.com/icon.png'), 'https://example.com/icon.png');
});
test('one complete refresh uses five fixed keyed requests and preserves provider mint order', async () => {
  const p = provider({ rows: [rawToken(firstUnknown, { symbol: 'SAME' }), rawToken(secondUnknown, { symbol: 'SAME' }), rawToken(firstUnknown), rawToken(SOL)] });
  const snapshot = await fetchFixture(p);
  assert.equal(p.calls.length, 5);
  assert.match(p.calls[0].url, /^https:\/\/api\.jup\.ag\/tokens\/v2\/search\?query=/);
  assert.equal(new URL(p.calls[0].url).searchParams.get('query').split(',').length, 13);
  for (const [index, interval] of MARKET_INTERVALS.entries()) assert.equal(p.calls[index + 1].url, `https://api.jup.ag/tokens/v2/toptrending/${interval}?limit=50`);
  for (const { init } of p.calls) { assert.equal(init.headers['x-api-key'], 'test-key-only'); assert.equal(init.redirect, 'error'); assert.ok(init.signal); }
  assert.deepEqual(snapshot.trending['24h'], [firstUnknown, secondUnknown, SOL]);
  assert.equal(snapshot.tokens.find(token => token.mint === BTC).price, null);
  assert.equal(JSON.stringify(snapshot).includes('test-key-only'), false);
});
test('suspicious/unpriced discoveries are excluded without inventing a local trend score', async () => {
  const snapshot = await fetchFixture(provider({ rows: [rawToken(firstUnknown, { audit: { isSus: true } }), rawToken(secondUnknown, { usdPrice: null }), rawToken(SOL)] }));
  assert.deepEqual(snapshot.trending['5m'], [SOL]);
});
test('provider authorization, limits, malformed data and transport errors are safely reported', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(fetchFixture(provider({ failAt: 1, status })), error => error instanceof MarketProviderError && !error.message.includes('private') && (status !== 429 || error.status === 429));
  }
  await assert.rejects(fetchFixture({ apiKey: '' }), /JUP_API_KEY/);
  await assert.rejects(fetchFixture({ fetchImpl: async () => Response.json({ error: 'not an array' }) }), /invalid token response/);
  await assert.rejects(fetchFixture({ fetchImpl: async () => new Response('[]', { headers: { 'content-length': '1500001' } }) }), /size limit/);
  await assert.rejects(fetchFixture({ fetchImpl: async () => { throw new Error('https://private.invalid?key=secret'); } }), error => error.message === 'Jupiter could not be reached.');
  await assert.rejects(fetchFixture(provider({ rows: [] })), /no usable token metadata/);
});
test('public snapshot allowlist removes entity/private fields and invalid ranks', async () => {
  const snapshot = await fetchFixture(provider());
  snapshot.privateKey = 'secret'; snapshot.tokens[0].created_by = 'private'; snapshot.trending['5m'].push('invalid');
  const clean = sanitizeSnapshot(snapshot, TIME);
  assert.equal(JSON.stringify(clean).includes('private'), false); assert.equal(JSON.stringify(clean).includes('secret'), false);
  assert.deepEqual(clean.trending['5m'], [SOL]); assert.equal(clean.tokens[0].stats['24h'].volume, 500);
  assert.equal(sanitizeSnapshot({ ...snapshot, fetchedAt: TIME + 20_000 }, TIME), null);
  assert.equal(sanitizeSnapshot({ ...snapshot, network: 'solana-devnet' }, TIME), null);
});
test('public reads only read bounded snapshots and keep a clear warming fallback', async () => {
  const entity = entityFixture(), data = await readMarketDiscovery(entity, TIME);
  assert.equal(data.status, 'warming'); assert.equal(data.tokens.length, 13); assert.equal(data.tokens[0].price, null);
  assert.deepEqual(entity.calls, [['filter', { scope: MARKET_SCOPE }, '-started_at', 5]]);
  assert.equal(emptySnapshot().trending['24h'].length, 0);
});
test('newest started generation wins even if an older worker finishes later; bad records fall back', async () => {
  const snapshot = await fetchFixture(provider());
  const old = { ...snapshot, fetchedAt: TIME + 20_000 }, newer = { ...snapshot, fetchedAt: TIME + 10_000 };
  const entity = entityFixture([record(old, TIME), record(newer, TIME + 5000), { scope: MARKET_SCOPE, started_at: TIME + 7000, payload_json: 'broken' }]);
  assert.equal((await readMarketDiscovery(entity, TIME + 30_000)).fetchedAt, newer.fetchedAt);
});
test('failed refresh never replaces the last good data or advances its timestamp', async () => {
  const previous = await fetchFixture(provider()), entity = entityFixture([record(previous)]), refresh = createMarketRefresher();
  const p = provider({ failAt: 4, status: 429 });
  await assert.rejects(refresh({ entity, apiKey: 'key', now: () => TIME + 60_000, pause: async () => {}, ...p }), /rate limit/);
  assert.equal(entity.rows.length, 1); assert.equal((await readMarketDiscovery(entity, TIME + 100_000)).status, 'stale');
  assert.equal((await readMarketDiscovery(entity, TIME + 301_000)).status, 'unavailable');
  assert.equal(entity.calls.some(call => call[0] === 'create'), false);
});
test('local overlapping refreshes coalesce, recent snapshots skip and obsolete data is pruned', async () => {
  const snapshot = await fetchFixture(provider()), entity = entityFixture([{ ...record({ ...snapshot, fetchedAt: TIME - 1_000_000 }), id: 'old' }]);
  const p = provider(), refresh = createMarketRefresher(), args = { entity, apiKey: 'key', now: () => TIME, pause: async () => {}, ...p };
  const results = await Promise.all([refresh(args), refresh(args)]);
  assert.equal(p.calls.length, 5); assert.deepEqual(results[0], results[1]); assert.equal(entity.rows.length, 1);
  assert.equal((await refresh(args)).refreshed, false); assert.equal(p.calls.length, 5);
});
test('freshness ages without successful reads and never invents a zero timestamp', () => {
  assert.equal(snapshotStatus(null, TIME), 'warming'); assert.equal(snapshotStatus(TIME, TIME + 89_000), 'fresh');
  assert.equal(snapshotStatus(TIME, TIME + 91_000), 'stale'); assert.equal(snapshotStatus(TIME, TIME + 301_000), 'unavailable');
});
test('refresh requires verified admin/service identity or the independent worker secret', async () => {
  const request = new Request('https://example.invalid', { method: 'POST', headers: { 'Base44-Service-Authorization': 'forged' }, body: JSON.stringify({ isScheduled: true, role: 'admin' }) });
  const client = user => ({ auth: { me: async () => user } });
  assert.equal(await canRefreshMarkets(request, client({ id: 'user', role: 'user' })), false);
  assert.equal(await canRefreshMarkets(request, client({ id: 'admin', role: 'admin' })), true);
  assert.equal(await canRefreshMarkets(request, client({ id: 'scheduler', is_service: true })), true);
  assert.equal(await canRefreshMarkets(request, client({ id: 'disabled', role: 'admin', disabled: true })), false);
  assert.equal(await canRefreshMarkets(request, client({ role: 'admin' })), false);
  const secret = 'test-worker-secret-'.repeat(3), worker = new Request('https://example.invalid', { headers: { 'x-kydos-market-token': secret } });
  assert.equal(await canRefreshMarkets(worker, client(null), secret), true);
  assert.equal(await canRefreshMarkets(worker, client(null), secret + 'x'), false);
  assert.equal(await canRefreshMarkets(new Request('https://example.invalid', { headers: { 'x-kydos-market-token': 'short' } }), client(null), 'short'), false);
});

function loadHandler(path, dependencies) {
  const source = ts.transpile(readFileSync(new URL(path, import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }).replace(/^import .*;\n/gm, '').replace('export default async function', 'return async function');
  return new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));
}
test('actual read handler works anonymously and returns no entity metadata', async () => {
  const snapshot = await fetchFixture(provider()), entity = entityFixture([record(snapshot)]);
  const handler = loadHandler('../base44/functions/marketDiscovery/entry.ts', { createClientFromRequest: () => ({ asServiceRole: { entities: { MarketDiscoverySnapshot: entity } } }), readMarketDiscovery });
  const response = await handler(new Request('https://example.invalid/marketDiscovery'));
  assert.equal(response.status, 200); assert.equal((await response.json()).network, 'solana-mainnet');
  assert.equal((await handler(new Request('https://example.invalid', { method: 'DELETE' }))).status, 405);
});
test('actual refresh handler denies public calls and reads only the exact backend key name', async () => {
  let user = null, refreshCalls = 0; const names = [], apiKeys = [];
  const handler = loadHandler('../base44/functions/refreshMarketDiscovery/entry.ts', {
    createClientFromRequest: () => ({ auth: { me: async () => user }, asServiceRole: { entities: { MarketDiscoverySnapshot: {} } } }),
    secrets: { get: name => { names.push(name); return name === 'JUP_API_KEY' ? 'server-only-test-key' : undefined; } }, canRefreshMarkets, MarketProviderError,
    createMarketRefresher: () => async ({ apiKey }) => { refreshCalls++; apiKeys.push(apiKey); return { refreshed: true, fetchedAt: TIME }; },
  });
  const request = () => new Request('https://example.invalid', { method: 'POST', body: JSON.stringify({ apiKey: 'attacker', isScheduled: true }) });
  assert.equal((await handler(request())).status, 403); assert.equal(refreshCalls, 0); assert.equal(names.includes('JUP_API_KEY'), false);
  user = { id: 'admin', role: 'admin' }; const response = await handler(request());
  assert.equal(response.status, 200); assert.deepEqual(apiKeys, ['server-only-test-key']); assert.equal(JSON.stringify(await response.json()).includes('server-only'), false);
});
test('catalog search resolves aliases, filters missing liquidity and preserves provider order', async () => {
  const snapshot = await fetchFixture(provider());
  const options = readMarketOptions(new URLSearchParams('q=WETH'));
  assert.deepEqual(selectMarkets(snapshot, options).map(token => token.mint), [ETH]);
  assert.deepEqual(selectMarkets(snapshot, { ...options, query: '', minLiquidity: 100000 }).map(token => token.mint), [SOL]);
  assert.equal(readMarketOptions(new URLSearchParams('tab=oops&interval=10m&liquidity=-1')).interval, '24h');
  assert.equal(selectMarkets(fallbackSnapshot, { ...options, tab: 'majors', query: '', minLiquidity: 1 }).length, 0);
});
test('watchlists keep exact identities after feed dropout and tolerate corrupted storage', () => {
  const token = { mint: firstUnknown, name: 'Saved coin', symbol: 'SAVED' };
  const saved = toggleSavedMarket([], token); assert.equal(saved.length, 1);
  const rows = selectMarkets(fallbackSnapshot, { ...readMarketOptions(new URLSearchParams()), tab: 'watchlist' }, saved);
  assert.equal(rows[0].symbol, 'SAVED'); assert.equal(rows[0].price, null); assert.equal(marketPath(rows[0].mint), `/markets/solana/${firstUnknown}`);
  assert.deepEqual(toggleSavedMarket(saved, token), []); assert.deepEqual(parseWatchlist('{broken'), []);
  assert.equal(parseWatchlist(JSON.stringify([token, token, { mint: 'bad', name: 'X', symbol: 'X' }])).length, 1);
  assert.equal(parseWatchlist(JSON.stringify([{ mint: BTC, name: 'Wrong', symbol: 'Wrong' }]))[0].symbol, 'cbBTC');
});
test('financial formatting distinguishes missing values, real zero and tiny prices', () => {
  assert.equal(formatPrice(null), '—'); assert.equal(formatPrice(0), '—'); assert.notEqual(formatPrice(0.0000000012), '$0.00');
  assert.equal(formatPrice(123.4), '$123.40'); assert.equal(formatCompact(0), '$0'); assert.equal(formatCompact(null), '—');
  assert.equal(formatChange(1.25), '+1.25%'); assert.equal(formatChange(-0.001), '0.00%'); assert.equal(formatChange(undefined), '—');
});
