import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { canRefreshMarkets, createMarketRefresher } from '../../shared/marketDiscovery.js';
import { MarketProviderError } from '../../shared/jupiterMarkets.js';

const refresh = createMarketRefresher();
export default async function(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const client = createClientFromRequest(request);
    if (!await canRefreshMarkets(request, client, secrets.get('KYDOS_MARKET_REFRESH_TOKEN'))) return Response.json({ error: 'Administrator or authorized scheduler required.' }, { status: 403, headers });
    const result = await refresh({ entity: client.asServiceRole.entities.MarketDiscoverySnapshot, apiKey: secrets.get('JUP_API_KEY') });
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof MarketProviderError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    return Response.json({ error: 'Market refresh failed; the last complete snapshot is retained.' }, { status: 503, headers });
  }
}
