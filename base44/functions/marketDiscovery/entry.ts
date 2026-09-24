import { secrets } from 'base44:runtime';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { fetchMarketSnapshot, MarketProviderError } from '../../shared/jupiterMarkets.js';
import { writeJupiterCandles } from '../../shared/jupiterCandleWriter.js';
import { readMarketRequest } from '../../shared/marketRequest.js';

export default async function(request: Request): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const input = request.method === 'POST' ? await readMarketRequest(request) : {};
    const data = await fetchMarketSnapshot({ apiKey: secrets.get('JUP_API_KEY'), interval: input.interval || '24h', mint: input.mint ?? null });
    const prices = Object.fromEntries(data.tokens.filter(token => Number.isFinite(token.price) && token.price > 0)
      .map(token => [token.mint, { price: token.price, blockId: token.priceBlockId }]));
    try {
      // Only provider-validated prices are persisted; callers cannot submit candle values.
      await writeJupiterCandles(createClientFromRequest(request).asServiceRole.entities, prices, data.fetchedAt);
    } catch (error) {
      console.error('Market candle sampling failed', error);
      data.sampleError = 'Chart sampling is temporarily unavailable.';
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof MarketProviderError || error.status === 400;
    return Response.json({ error: known ? error.message : 'Market data is temporarily unavailable.' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}