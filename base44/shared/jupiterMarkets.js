import { MARKET_CATALOG, MARKET_INTERVALS, MARKET_NETWORK, MARKET_SCHEMA, isSolanaMint } from './marketCatalog.js';

const TOKEN_PROGRAMS = new Set(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
export const MAX_PAYLOAD_BYTES = 750_000;
const MAX_PROVIDER_BYTES = 1_500_000;
const numberOrNull = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = value => numberOrNull(value) !== null && value >= 0 ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
export function safeIcon(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 2048 ? url.href : null; }
  catch { return null; }
}
function isoDate(value) {
  const date = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? new Date(date).toISOString() : null;
}
function cleanStats(raw = {}) {
  const buyVolume = nonnegative(raw?.buyVolume), sellVolume = nonnegative(raw?.sellVolume);
  return {
    priceChange: numberOrNull(raw?.priceChange),
    volume: buyVolume === null || sellVolume === null ? null : nonnegative(buyVolume + sellVolume),
    buyVolume, sellVolume, buys: count(raw?.numBuys), sells: count(raw?.numSells), traders: count(raw?.numTraders),
  };
}
export function emptyMarketToken(identity) {
  return {
    mint: identity.mint, name: identity.name, symbol: identity.symbol, icon: null,
    decimals: null, tokenProgram: null, price: null, liquidity: null, marketCap: null, fdv: null, holders: null,
    verified: false, suspicious: false, available: false, providerUpdatedAt: null, priceBlockId: null,
    stats: Object.fromEntries(MARKET_INTERVALS.map(interval => [interval, cleanStats()])),
  };
}
export function normalizeJupiterToken(raw) {
  if (!raw || !isSolanaMint(raw.id) || !TOKEN_PROGRAMS.has(raw.tokenProgram) || !Number.isInteger(raw.decimals) || raw.decimals < 0 || raw.decimals > 255) return null;
  const identity = MARKET_CATALOG.find(token => token.mint === raw.id);
  const price = nonnegative(raw.usdPrice);
  return {
    mint: raw.id, name: identity?.name || text(raw.name, 80) || 'Unknown token',
    symbol: identity?.symbol || text(raw.symbol, 24) || raw.id.slice(0, 6), icon: safeIcon(raw.icon),
    decimals: raw.decimals, tokenProgram: raw.tokenProgram, price: price > 0 ? price : null,
    liquidity: nonnegative(raw.liquidity), marketCap: identity?.kind === 'wrapped' ? null : nonnegative(raw.mcap),
    fdv: identity?.kind === 'wrapped' ? null : nonnegative(raw.fdv), holders: count(raw.holderCount),
    verified: raw.isVerified === true, suspicious: raw.audit?.isSus === true, available: true,
    providerUpdatedAt: isoDate(raw.updatedAt), priceBlockId: count(raw.priceBlockId),
    stats: Object.fromEntries(MARKET_INTERVALS.map(interval => [interval, cleanStats(raw[`stats${interval}`])])),
  };
}

export class MarketProviderError extends Error {
  constructor(code, message, status = 503) { super(message); this.name = 'MarketProviderError'; this.code = code; this.status = status; }
}
async function readBoundedJson(response) {
  if (Number(response.headers.get('content-length')) > MAX_PROVIDER_BYTES) throw new MarketProviderError('provider_shape', 'Jupiter response exceeded the size limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new MarketProviderError('provider_shape', 'Jupiter returned an empty response.');
  const decoder = new TextDecoder(); let size = 0, body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVIDER_BYTES) { await reader.cancel(); throw new MarketProviderError('provider_shape', 'Jupiter response exceeded the size limit.'); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed) || parsed.length > 100) throw new Error('shape');
    return parsed;
  } catch (error) {
    if (error instanceof MarketProviderError) throw error;
    throw new MarketProviderError('provider_shape', 'Jupiter returned an invalid token response.');
  } finally { reader.releaseLock(); }
}
export async function fetchMarketSnapshot({ apiKey, fetchImpl = fetch, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new MarketProviderError('missing_key', 'Configure JUP_API_KEY in the backend environment.');
  const request = async path => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetchImpl(`https://api.jup.ag/tokens/v2/${path}`, { headers: { 'x-api-key': apiKey }, signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) throw new MarketProviderError('rate_limited', 'Jupiter rate limit reached; the last complete snapshot is retained.', 429);
        if (response.status === 401 || response.status === 403) throw new MarketProviderError('provider_auth', 'Jupiter rejected the backend API credentials.');
        throw new MarketProviderError('provider_unavailable', 'Jupiter is temporarily unavailable.');
      }
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof MarketProviderError) throw error;
      throw new MarketProviderError('provider_unavailable', 'Jupiter could not be reached.');
    } finally { clearTimeout(timer); }
  };
  const tokens = new Map(MARKET_CATALOG.map(identity => [identity.mint, emptyMarketToken(identity)]));
  const curated = await request(`search?query=${MARKET_CATALOG.map(token => token.mint).join(',')}`);
  for (const raw of curated) {
    const token = normalizeJupiterToken(raw);
    if (token && tokens.has(token.mint)) tokens.set(token.mint, token);
  }
  const trending = {};
  for (const interval of MARKET_INTERVALS) {
    await pause(1050); // One small shared job, comfortably below the free 60 requests/minute limit.
    const rows = await request(`toptrending/${interval}?limit=50`), ranks = [];
    for (const raw of rows.slice(0, 50)) {
      const token = normalizeJupiterToken(raw);
      if (!token || token.suspicious || token.price === null || ranks.includes(token.mint)) continue;
      ranks.push(token.mint);
      // Prefer the curated lookup, otherwise use the first complete token record across intervals.
      if (!tokens.get(token.mint)?.available) tokens.set(token.mint, token);
    }
    trending[interval] = ranks;
  }
  if (![...tokens.values()].some(token => token.available)) throw new MarketProviderError('provider_shape', 'Jupiter returned no usable token metadata.');
  return { schema: MARKET_SCHEMA, network: MARKET_NETWORK, source: 'Jupiter Tokens V2', fetchedAt: now(), tokens: [...tokens.values()], trending };
}

// Stored records are never returned verbatim. This allowlist also drops entity metadata.
export function sanitizeSnapshot(value, now = Date.now()) {
  if (!value || value.schema !== MARKET_SCHEMA || value.network !== MARKET_NETWORK || !Number.isFinite(value.fetchedAt) || value.fetchedAt <= 0 || value.fetchedAt > now + 10_000 || !Array.isArray(value.tokens) || value.tokens.length > 225) return null;
  const tokens = new Map();
  for (const token of value.tokens) {
    if (!token || !isSolanaMint(token.mint)) continue;
    const identity = MARKET_CATALOG.find(item => item.mint === token.mint);
    if (token.available !== true) { if (identity) tokens.set(token.mint, emptyMarketToken(identity)); continue; }
    const raw = { id: token.mint, name: token.name, symbol: token.symbol, icon: token.icon, tokenProgram: token.tokenProgram, decimals: token.decimals, usdPrice: token.price, liquidity: token.liquidity, mcap: token.marketCap, fdv: token.fdv, holderCount: token.holders, isVerified: token.verified, audit: { isSus: token.suspicious }, updatedAt: token.providerUpdatedAt, priceBlockId: token.priceBlockId };
    for (const interval of MARKET_INTERVALS) {
      const stats = token.stats?.[interval];
      raw[`stats${interval}`] = { priceChange: stats?.priceChange, buyVolume: stats?.buyVolume, sellVolume: stats?.sellVolume, numBuys: stats?.buys, numSells: stats?.sells, numTraders: stats?.traders };
    }
    const cleaned = normalizeJupiterToken(raw);
    if (cleaned) tokens.set(cleaned.mint, cleaned);
  }
  if (!tokens.size) return null;
  for (const identity of MARKET_CATALOG) if (!tokens.has(identity.mint)) tokens.set(identity.mint, emptyMarketToken(identity));
  const trending = {};
  for (const interval of MARKET_INTERVALS) {
    if (!Array.isArray(value.trending?.[interval])) return null;
    trending[interval] = [...new Set(value.trending[interval])].filter(mint => tokens.get(mint)?.available && !tokens.get(mint).suspicious && tokens.get(mint).price !== null).slice(0, 50);
  }
  return { schema: MARKET_SCHEMA, network: MARKET_NETWORK, source: 'Jupiter Tokens V2', fetchedAt: value.fetchedAt, tokens: [...tokens.values()], trending };
}
