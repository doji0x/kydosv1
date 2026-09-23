import { isSolanaMint } from './marketCatalog.js';

export const CHART_INTERVALS = {
  '1m': { unit: 'minute', aggregate: 1, seconds: 60 },
  '5m': { unit: 'minute', aggregate: 5, seconds: 300 },
  '15m': { unit: 'minute', aggregate: 15, seconds: 900 },
  '1h': { unit: 'hour', aggregate: 1, seconds: 3600 },
  '1d': { unit: 'day', aggregate: 1, seconds: 86400 },
};
export const CANDLE_LIMIT = 300;
const NAMESPACE = 'gecko-charts-v1', MINUTE = 60_000, HOUR = 60 * MINUTE;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const amount = value => (typeof value === 'number' || (typeof value === 'string' && value.trim())) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const label = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100) : '';

export class CandleError extends Error {
  constructor(code, message, status = 503, retryAfter = 60) { super(message); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
export function chartInput(input, now = Date.now()) {
  if (!input || !isSolanaMint(input.mint) || !Object.hasOwn(CHART_INTERVALS, input.interval)) throw new CandleError('invalid_input', 'A valid Solana mint and supported candle interval are required.', 400);
  if (input.pool != null && !isSolanaMint(input.pool)) throw new CandleError('invalid_input', 'Invalid pool address.', 400);
  if (input.before != null && (!Number.isSafeInteger(input.before) || input.before < 1 || input.before > Math.floor(now / 1000))) throw new CandleError('invalid_input', 'Invalid history cursor.', 400);
  if (input.before != null && !input.pool) throw new CandleError('invalid_input', 'History requests must keep the selected pool.', 400);
  return { mint: input.mint, interval: input.interval, pool: input.pool || null, before: input.before ?? null };
}
export function normalizePool(raw, mint) {
  const attributes = raw?.attributes;
  const baseMint = raw?.relationships?.base_token?.data?.id?.replace(/^solana_/, '');
  const quoteMint = raw?.relationships?.quote_token?.data?.id?.replace(/^solana_/, '');
  if (!isSolanaMint(attributes?.address) || raw.id !== `solana_${attributes.address}` || !isSolanaMint(baseMint) || !isSolanaMint(quoteMint) || (baseMint !== mint && quoteMint !== mint)) return null;
  return { address: attributes.address, name: label(attributes.name) || 'Solana pool', baseMint, quoteMint, tokenSide: baseMint === mint ? 'base' : 'quote', dex: label(raw.relationships?.dex?.data?.id), liquidity: amount(attributes.reserve_in_usd) };
}
export function normalizeCandles(rows, { interval, before }, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length > CANDLE_LIMIT) throw new CandleError('provider_shape', 'The chart provider returned an invalid candle response.');
  const candles = new Map(), seconds = CHART_INTERVALS[interval].seconds;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every(finite)) continue;
    const [time, open, high, low, close, volume] = row;
    if (!Number.isSafeInteger(time) || time <= 0 || time % seconds !== 0 || time > Math.floor(now / 1000) || (before !== null && before !== undefined && time > before) || low <= 0 || high < Math.max(open, close) || low > Math.min(open, close) || volume < 0) continue;
    candles.set(time, { time, open, high, low, close, volume });
  }
  if (rows.length && !candles.size) throw new CandleError('provider_shape', 'The chart provider returned no valid candles.');
  return [...candles.values()].sort((a, b) => a.time - b.time);
}
async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader || Number(response.headers.get('content-length')) > 1_000_000) throw new CandleError('provider_shape', 'The chart response exceeded the size limit.');
  const decoder = new TextDecoder(); let bytes = 0, body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 1_000_000) { await reader.cancel(); throw new CandleError('provider_shape', 'The chart response exceeded the size limit.'); }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) { if (error instanceof CandleError) throw error; throw new CandleError('provider_shape', 'The chart provider returned invalid data.'); }
  finally { reader.releaseLock(); }
}
function safePool(value, mint) {
  if (!value || !isSolanaMint(value.address) || !isSolanaMint(value.baseMint) || !isSolanaMint(value.quoteMint) || (mint !== value.baseMint && mint !== value.quoteMint)) return null;
  return { address: value.address, name: label(value.name), baseMint: value.baseMint, quoteMint: value.quoteMint, tokenSide: mint === value.baseMint ? 'base' : 'quote', dex: label(value.dex), liquidity: amount(value.liquidity) };
}
function safeChart(value, input, now) {
  const pool = safePool(value?.pool, input.mint);
  if (!pool || value.mint !== input.mint || value.interval !== input.interval || value.before !== input.before || (input.pool && pool.address !== input.pool) || !finite(value.fetchedAt) || value.fetchedAt > now + 10_000 || !Array.isArray(value.candles)) return null;
  try {
    const candles = normalizeCandles(value.candles.map(bar => [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume]), input, now);
    const hasMore = value.hasMore === true && candles.length > 0;
    return { network: 'solana-mainnet', mint: input.mint, interval: input.interval, before: input.before, pool, candles, currency: 'USD', volumeCurrency: 'USD', source: 'GeckoTerminal', fetchedAt: value.fetchedAt, hasMore, nextBefore: hasMore ? candles[0].time - 1 : null };
  } catch { return null; }
}

export function createCandleService({ fetchImpl = fetch, now = Date.now, requestsPerMinute = 16 } = {}) {
  const pending = new Map(); let calls = [], lastCleanup = 0;
  const coalesce = async (key, run) => {
    if (pending.has(key)) return pending.get(key);
    const work = run(); pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
  async function read(entity, key) {
    const rows = await entity.filter({ namespace: NAMESPACE, cache_key: key }, '-started_at', 2);
    for (const row of rows) {
      if (typeof row.payload_json !== 'string' || row.payload_json.length > 150_000) continue;
      try { return { value: JSON.parse(row.payload_json), fresh: row.expires_at > now() }; } catch { /* Try the preceding generation. */ }
    }
    return null;
  }
  async function save(entity, key, value, ttl, startedAt) {
    const payload = JSON.stringify(value);
    if (new TextEncoder().encode(payload).length > 150_000) throw new CandleError('cache_size', 'Chart data exceeded the storage limit.');
    await entity.create({ namespace: NAMESPACE, cache_key: key, started_at: startedAt, expires_at: now() + ttl, payload_json: payload });
    try {
      const generations = await entity.filter({ namespace: NAMESPACE, cache_key: key }, '-started_at', 20);
      // Keep two generations. Strict comparison preserves concurrent timestamp ties.
      for (const row of generations.slice(2)) if (row.started_at < generations[1].started_at) await entity.delete(row.id);
    } catch { /* Retention must not turn a successful provider read into a failure. */ }
    if (now() - lastCleanup > MINUTE) {
      lastCleanup = now();
      try { for (const row of await entity.filter({ namespace: NAMESPACE, expires_at: { $lt: now() - 14 * 24 * HOUR } }, 'expires_at', 50)) await entity.delete(row.id); }
      catch { /* A cleanup failure must not hide successfully fetched data. */ }
    }
  }
  async function request(entity, path) {
    const cooldown = await read(entity, 'provider-cooldown');
    if (cooldown?.value?.until > now()) throw new CandleError('rate_limited', 'Chart updates are temporarily paused. Please retry shortly.', 429, Math.ceil((cooldown.value.until - now()) / 1000));
    calls = calls.filter(time => now() - time < MINUTE);
    if (calls.length >= requestsPerMinute) throw new CandleError('rate_limited', 'The chart request limit was reached. Please retry shortly.', 429, Math.max(1, Math.ceil((calls[0] + MINUTE - now()) / 1000)));
    calls.push(now());
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(`https://api.geckoterminal.com/api/v2/networks/solana/${path}`, { headers: { Accept: 'application/json;version=20230203' }, signal: controller.signal, redirect: 'manual' });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) {
          const raw = response.headers.get('retry-after'), seconds = Number(raw);
          const delay = Math.min(3600, Math.max(60, Number.isFinite(seconds) && seconds > 0 ? seconds : (Date.parse(raw) - now()) / 1000 || 60));
          await save(entity, 'provider-cooldown', { until: now() + delay * 1000 }, delay * 1000, now());
          throw new CandleError('rate_limited', 'The chart provider is busy. Showing saved data when available.', 429, Math.ceil(delay));
        }
        if (response.status === 404) throw new CandleError('no_market', 'No chart is available for this Solana market yet.', 404);
        throw new CandleError('provider_unavailable', 'The chart provider is temporarily unavailable.');
      }
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof CandleError) throw error;
      console.error('Chart provider request failed', error?.name, error?.message);
      throw new CandleError('provider_unavailable', 'The chart provider could not be reached.');
    }
    finally { clearTimeout(timer); }
  }
  async function poolFor(entity, mint, address) {
    const key = address ? `pool:${mint}:${address}` : `selection:${mint}`;
    return coalesce(key, async () => {
      const cached = await read(entity, key), previous = safePool(cached?.value, mint);
      if (cached?.fresh && previous && (!address || address === previous.address)) return previous;
      const startedAt = now();
      try {
        const data = await request(entity, address ? `pools/${address}` : `tokens/${mint}/pools?page=1`);
        const pools = address ? [data.data] : data.data;
        if (!Array.isArray(pools) || pools.length > 100) throw new CandleError('provider_shape', 'The chart provider returned an invalid pool list.');
        const selected = pools.map(pool => normalizePool(pool, mint)).find(pool => pool && (!address || pool.address === address) && (address || pool.liquidity > 0));
        if (!selected) throw new CandleError('no_market', 'No liquid pool with chart history was found for this mint.', 404);
        await save(entity, key, selected, 6 * HOUR, startedAt);
        if (!address) await save(entity, `pool:${mint}:${selected.address}`, selected, 7 * 24 * HOUR, startedAt);
        return selected;
      } catch (error) { if (previous && (!address || previous.address === address)) return previous; throw error; }
    });
  }
  return async (entity, input) => {
    const params = chartInput(input, now());
    const pool = await poolFor(entity, params.mint, params.pool);
    const pinned = { ...params, pool: pool.address }, key = `candles:${params.mint}:${pool.address}:${params.interval}:${params.before ?? 'latest'}`;
    // Automatic selection and an explicit pool address can resolve to the same page.
    // Share the cache read, provider request and publication by that resolved identity.
    return coalesce(key, async () => {
      const cached = await read(entity, key), previous = safeChart(cached?.value, pinned, now());
      if (cached?.fresh && previous) return { ...previous, stale: false };
      const frame = CHART_INTERVALS[params.interval], startedAt = now();
      try {
        const query = new URLSearchParams({ aggregate: String(frame.aggregate), limit: String(CANDLE_LIMIT), currency: 'usd', token: pool.tokenSide, include_empty_intervals: 'false' });
        if (params.before) query.set('before_timestamp', String(params.before));
        const data = await request(entity, `pools/${pool.address}/ohlcv/${frame.unit}?${query}`);
        if (data.meta?.base?.address !== pool.baseMint || data.meta?.quote?.address !== pool.quoteMint) throw new CandleError('provider_shape', 'Chart token identity did not match the selected pool.');
        const rows = data.data?.attributes?.ohlcv_list;
        const candles = normalizeCandles(rows, params, now()), hasMore = rows.length === CANDLE_LIMIT && candles.length > 0;
        if (!params.before && previous?.candles.length && !candles.length) throw new CandleError('empty_update', 'The provider returned an empty update. Showing saved candles.');
        const result = { network: 'solana-mainnet', mint: params.mint, interval: params.interval, before: params.before, pool, candles, currency: 'USD', volumeCurrency: 'USD', source: 'GeckoTerminal', fetchedAt: now(), hasMore, nextBefore: hasMore ? candles[0].time - 1 : null };
        await save(entity, key, result, params.before ? 24 * HOUR : MINUTE, startedAt);
        return { ...result, stale: false };
      } catch (error) {
        if (previous) return { ...previous, stale: true, warning: error instanceof CandleError ? error.message : 'Chart updates are unavailable.', retryAfter: error instanceof CandleError ? error.retryAfter : 60 };
        throw error;
      }
    });
  };
}
