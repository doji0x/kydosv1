import { isSolanaMint } from './marketCatalog.js';
import { jupiterRequest, MarketProviderError } from './jupiterHttp.js';
export async function fetchJupiterPrices(mints, options) {
  const unique = [...new Set(mints)];
  if (unique.length > 225 || unique.some(mint => !isSolanaMint(mint))) throw new MarketProviderError('invalid_input', 'Invalid price request.', 400);
  const prices = {};
  // The provider accepts at most fifty exact mint addresses per request.
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const data = await jupiterRequest(`price/v3?ids=${batch.join(',')}`, options);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new MarketProviderError('provider_shape', 'Jupiter returned invalid prices.');
    for (const mint of batch) {
      const row = data[mint];
      if (!row || !Number.isFinite(row.usdPrice) || row.usdPrice <= 0) continue;
      prices[mint] = { price: row.usdPrice, blockId: Number.isSafeInteger(row.blockId) && row.blockId >= 0 ? row.blockId : null,
        decimals: Number.isInteger(row.decimals) && row.decimals >= 0 && row.decimals <= 255 ? row.decimals : null,
        liquidity: Number.isFinite(row.liquidity) && row.liquidity >= 0 ? row.liquidity : null,
        priceChange24h: Number.isFinite(row.priceChange24h) ? row.priceChange24h : null };
    }
  }
  return prices;
}