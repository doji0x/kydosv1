import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { pollJupiterCandles } from '../../shared/jupiterCandleWriter.js';
import { MarketProviderError } from '../../shared/jupiterHttp.js';
import { readMarketRequest } from '../../shared/marketRequest.js';
let pending;
export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  try {
    const client = createClientFromRequest(req);
    const user = await client.auth.me();
    if (!user?.id || user.role !== 'admin' || user.disabled) return Response.json({ error: 'Administrator required.' }, { status: 403 });
    const input = await readMarketRequest(req);
    // A delayed old workflow must not overlap the next five-minute collection window.
    if (input.cycleStartedAt) {
      const startedAt = Date.parse(input.cycleStartedAt);
      if (!Number.isFinite(startedAt) || Date.now() - startedAt >= 300000) return Response.json({ skipped: true, wait: 'PT1S' });
    }
    if (!pending) pending = pollJupiterCandles(client.asServiceRole.entities, secrets.get('JUP_API_KEY')).finally(() => { pending = null; });
    const result = await pending;
    return Response.json({ ...result, wait: `PT${Math.max(1, Math.ceil((60000 - Date.now() % 60000) / 1000))}S` });
  } catch (error) {
    console.error('Jupiter sampling failed', error instanceof MarketProviderError ? error.code : error?.message);
    return Response.json({ error: error instanceof MarketProviderError || error.status === 400 ? error.message : 'Jupiter sampling failed.' }, { status: error instanceof MarketProviderError || error.status === 400 ? error.status : 503 });
  }
}