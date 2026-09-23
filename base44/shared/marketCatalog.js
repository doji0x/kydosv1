// Public identity data only. This module is also used by the browser.
export const MARKET_NETWORK = 'solana-mainnet';
export const MARKET_INTERVALS = ['5m', '1h', '6h', '24h'];
export const MARKET_SCOPE = 'solana:mainnet:jupiter:v1';
export const MARKET_SCHEMA = 1;
export const STALE_AFTER_MS = 90_000;
export const EXPIRE_AFTER_MS = 300_000;

export const MARKET_CATALOG = [
  { mint: 'So11111111111111111111111111111111111111112', name: 'Solana', symbol: 'SOL', group: 'major', featured: true, kind: 'native', aliases: ['WSOL'], source: 'https://developers.jup.ag/docs/tokens/token-information' },
  { mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', name: 'Bitcoin', symbol: 'cbBTC', group: 'major', featured: true, kind: 'wrapped', wrapper: 'Coinbase wrapped BTC', aliases: ['BTC', 'Bitcoin'], source: 'https://www.coinbase.com/cbbtc' },
  { mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', name: 'Ether', symbol: 'ETH', group: 'major', featured: true, kind: 'wrapped', wrapper: 'Portal / Wormhole ETH', aliases: ['WETH', 'Ethereum'], source: 'https://jup.ag/tokens/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs' },
  { mint: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', name: 'Fartcoin', symbol: 'FARTCOIN', group: 'meme', featured: true },
  { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', name: 'dogwifhat', symbol: 'WIF', group: 'meme', featured: true, source: 'https://dogwifcoin.org' },
  { mint: '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump', name: 'The Black Bull', symbol: 'ANSEM', group: 'meme', featured: true },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', name: 'Jupiter', symbol: 'JUP', group: 'major' },
  { mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', name: 'Jito', symbol: 'JTO', group: 'major' },
  { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', name: 'Raydium', symbol: 'RAY', group: 'major' },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', name: 'Bonk', symbol: 'BONK', group: 'meme' },
  { mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv', name: 'Pudgy Penguins', symbol: 'PENGU', group: 'meme' },
  { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', name: 'Popcat', symbol: 'POPCAT', group: 'meme' },
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USD Coin', symbol: 'USDC', group: 'quote' },
].map(token => ({ kind: 'token', aliases: [], featured: false, source: `https://jup.ag/tokens/${token.mint}`, ...token }));

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function isSolanaMint(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  let number = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }
  let bytes = 0;
  for (; number > 0n; number >>= 8n) bytes++;
  return bytes + (value.match(/^1*/)?.[0].length || 0) === 32;
}

export function snapshotStatus(fetchedAt, now = Date.now()) {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return 'warming';
  const age = Math.max(0, now - fetchedAt);
  return age > EXPIRE_AFTER_MS ? 'unavailable' : age > STALE_AFTER_MS ? 'stale' : 'fresh';
}
