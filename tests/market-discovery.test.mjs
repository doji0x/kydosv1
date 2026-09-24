import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_CATALOG } from '../base44/shared/marketCatalog.js';
import { fetchJupiterPrices } from '../base44/shared/jupiterPrices.js';
import { fetchMarketSnapshot } from '../base44/shared/jupiterMarkets.js';
import { readMarketOptions, selectMarkets } from '../src/lib/markets.js';

const mint = MARKET_CATALOG[0].mint;
test('Jupiter Price V3 quotes are keyed by mint, with missing prices omitted', async () => {
  const fetchImpl = async url => Response.json({ [mint]: { usdPrice: 123, blockId: 10, priceChange24h: -1.5 } });
  const prices = await fetchJupiterPrices([mint, MARKET_CATALOG[1].mint], { apiKey: 'test', fetchImpl });
  assert.equal(prices[mint].price, 123); assert.equal(prices[MARKET_CATALOG[1].mint], undefined);
});
test('direct discovery uses token metadata but never falls back to an unreliable Tokens V2 price', async () => {
  const raw = { id: mint, tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', decimals: 9, name: 'SOL', symbol: 'SOL', usdPrice: 999, isVerified: true };
  const fetchImpl = async url => Response.json(url.includes('/price/v3') ? {} : [raw]);
  const snapshot = await fetchMarketSnapshot({ apiKey: 'test', fetchImpl, now: () => 1790232480000, interval: '24h' });
  assert.equal(snapshot.tokens.find(token => token.mint === mint).price, null);
  assert.deepEqual(snapshot.trending['24h'], []);
  assert.equal(selectMarkets(snapshot, readMarketOptions(new URLSearchParams('tab=majors'))).length > 0, true);
});