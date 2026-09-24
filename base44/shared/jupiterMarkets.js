import { MARKET_CATALOG, MARKET_INTERVALS, MARKET_NETWORK, MARKET_SCHEMA, isSolanaMint } from './marketCatalog.js';
import { jupiterRequest, MarketProviderError } from './jupiterHttp.js';
import { fetchJupiterPrices } from './jupiterPrices.js';
export { MarketProviderError } from './jupiterHttp.js';

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

export async function fetchMarketSnapshot({ apiKey, fetchImpl = fetch, now = Date.now, interval = '24h', mint = null }) {
  if (!MARKET_INTERVALS.includes(interval) || mint != null && !isSolanaMint(mint)) throw new MarketProviderError('invalid_input', 'Invalid market selection.', 400);
  const options = { apiKey, fetchImpl }, identities = [...MARKET_CATALOG.map(token => token.mint)];
  if (mint && !identities.includes(mint)) identities.push(mint);
  const [curated, ranked] = await Promise.all([
    jupiterRequest(`tokens/v2/search?query=${identities.join(',')}`, options),
    jupiterRequest(`tokens/v2/toptrending/${interval}?limit=50`, options),
  ]);
  if (![curated, ranked].every(rows => Array.isArray(rows) && rows.length <= 100)) throw new MarketProviderError('provider_shape', 'Jupiter returned an invalid token response.');
  const tokens = new Map(MARKET_CATALOG.map(identity => [identity.mint, emptyMarketToken(identity)]));
  if (mint && !tokens.has(mint)) tokens.set(mint, emptyMarketToken({ mint, name: 'Solana token', symbol: mint.slice(0, 6) }));
  for (const raw of [...ranked, ...curated]) {
    const token = normalizeJupiterToken(raw);
    if (token && (!token.suspicious || identities.includes(token.mint))) tokens.set(token.mint, token);
  }
  const prices = await fetchJupiterPrices([...tokens.keys()], options);
  for (const token of tokens.values()) {
    const quote = prices[token.mint];
    // Never defeat Price V3's reliability filters with a Tokens V2 price fallback.
    token.price = quote?.price ?? null;
    token.priceBlockId = quote?.blockId ?? null;
    token.decimals = quote?.decimals ?? token.decimals;
    token.liquidity = quote?.liquidity ?? token.liquidity;
    token.available = token.available || !!quote;
    token.stats['24h'].priceChange = quote?.priceChange24h ?? null;
  }
  const trending = Object.fromEntries(MARKET_INTERVALS.map(key => [key, []]));
  trending[interval] = [...new Set(ranked.map(row => row.id))].filter(id => tokens.get(id)?.price != null && !tokens.get(id).suspicious).slice(0, 50);
  return { schema: MARKET_SCHEMA, network: MARKET_NETWORK, source: 'Jupiter Price V3 + Tokens V2', fetchedAt: now(), tokens: [...tokens.values()], trending, status: 'fresh' };
}