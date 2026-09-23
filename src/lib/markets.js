import { MARKET_CATALOG, MARKET_INTERVALS, MARKET_NETWORK, MARKET_SCHEMA, isSolanaMint, snapshotStatus } from '../../base44/shared/marketCatalog.js';

export { MARKET_CATALOG, MARKET_INTERVALS, MARKET_NETWORK, isSolanaMint, snapshotStatus };
export const MARKET_TABS = ['trending', 'majors', 'memes', 'kydos', 'watchlist'];
export const WATCHLIST_KEY = 'kydos:solana-mainnet:watchlist:v1';
export const MAX_WATCHLIST_SIZE = 100;
export const marketPath = mint => `/markets/solana/${mint}`;
export const shortMint = mint => `${mint.slice(0, 4)}…${mint.slice(-4)}`;
export const identityFor = mint => MARKET_CATALOG.find(token => token.mint === mint);
export const emptyToken = identity => ({ ...identity, price: null, liquidity: null, marketCap: null, fdv: null, holders: null, icon: null, available: false, verified: false, stats: {} });
export const fallbackSnapshot = {
  schema: MARKET_SCHEMA, network: MARKET_NETWORK, fetchedAt: null, source: 'Jupiter Tokens V2',
  tokens: MARKET_CATALOG.map(emptyToken), trending: Object.fromEntries(MARKET_INTERVALS.map(interval => [interval, []])),
};

const isNumber = value => typeof value === 'number' && Number.isFinite(value);
export function formatPrice(value) {
  if (!isNumber(value) || value <= 0) return '—';
  if (value < 0.000001) return `$${value.toExponential(2)}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value >= 1 ? 2 : 0, maximumFractionDigits: value >= 1 ? 2 : Math.min(9, Math.ceil(-Math.log10(value)) + 2) }).format(value);
}
export function formatCompact(value, currency = true) {
  if (!isNumber(value) || value < 0) return '—';
  return `${currency ? '$' : ''}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
}
export function formatChange(value) {
  if (!isNumber(value)) return '—';
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
}
export function ageLabel(timestamp, now) {
  if (!timestamp) return 'Awaiting market data';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Updated ${hours}h ago` : `Updated ${Math.floor(hours / 24)}d ago`;
}
export function readMarketOptions(params) {
  return {
    tab: MARKET_TABS.includes(params.get('tab')) ? params.get('tab') : 'trending',
    interval: MARKET_INTERVALS.includes(params.get('interval')) ? params.get('interval') : '24h',
    query: (params.get('q') || '').slice(0, 100),
    sort: ['rank', 'change', 'volume', 'liquidity'].includes(params.get('sort')) ? params.get('sort') : 'rank',
    verifiedOnly: params.get('verified') === 'true',
    minLiquidity: ['10000', '100000', '1000000'].includes(params.get('liquidity')) ? Number(params.get('liquidity')) : 0,
  };
}
export function selectMarkets(snapshot, options, watchlist = []) {
  const tokens = new Map(snapshot.tokens.map(token => [token.mint, token]));
  let list;
  if (options.tab === 'watchlist') list = watchlist.map(saved => tokens.get(saved.mint) || emptyToken(identityFor(saved.mint) || saved));
  else if (options.tab === 'majors' || options.tab === 'memes') list = MARKET_CATALOG.filter(token => token.group === (options.tab === 'majors' ? 'major' : 'meme')).map(identity => tokens.get(identity.mint) || emptyToken(identity));
  else list = (snapshot.trending[options.interval] || []).map(mint => tokens.get(mint)).filter(Boolean);
  // Search covers the downloaded catalog, not a provider-wide symbol lookup.
  const query = options.query.trim().toLowerCase();
  if (query && options.tab === 'trending') list = snapshot.tokens;
  list = list.map((token, index) => ({ ...token, rank: index + 1 })).filter(token => {
    const identity = identityFor(token.mint);
    return (!query || [token.name, token.symbol, token.mint, ...(identity?.aliases || [])].some(value => value?.toLowerCase().includes(query)))
      && (!options.verifiedOnly || token.verified) && (!options.minLiquidity || token.liquidity >= options.minLiquidity);
  });
  const value = token => options.sort === 'change' ? token.stats?.[options.interval]?.priceChange : options.sort === 'volume' ? token.stats?.[options.interval]?.volume : token.liquidity;
  if (options.sort !== 'rank') list.sort((a, b) => {
    const left = value(a), right = value(b);
    if (!isNumber(left)) return !isNumber(right) ? a.rank - b.rank : 1;
    if (!isNumber(right)) return -1;
    return right - left || a.rank - b.rank;
  });
  return list;
}
export function parseWatchlist(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map();
    for (const item of parsed.slice(0, MAX_WATCHLIST_SIZE)) {
      if (!item || !isSolanaMint(item.mint) || typeof item.name !== 'string' || typeof item.symbol !== 'string') continue;
      const identity = identityFor(item.mint);
      unique.set(item.mint, { mint: item.mint, name: identity?.name || item.name.slice(0, 80), symbol: identity?.symbol || item.symbol.slice(0, 24) });
    }
    return [...unique.values()];
  } catch { return []; }
}
export function toggleSavedMarket(saved, token) {
  if (!isSolanaMint(token?.mint)) return saved;
  if (saved.some(item => item.mint === token.mint)) return saved.filter(item => item.mint !== token.mint);
  if (saved.length >= MAX_WATCHLIST_SIZE) throw new Error('Your watchlist is full. Remove a coin to add another.');
  return parseWatchlist(JSON.stringify([...saved, { mint: token.mint, name: token.name, symbol: token.symbol }]));
}
