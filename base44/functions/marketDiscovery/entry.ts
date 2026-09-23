import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { readMarketDiscovery } from '../../shared/marketDiscovery.js';

export default async function(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET, POST' } });
  try {
    const client = createClientFromRequest(request);
    const data = await readMarketDiscovery(client.asServiceRole.entities.MarketDiscoverySnapshot);
    return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=15' } });
  } catch {
    return Response.json({ error: 'Market data is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
