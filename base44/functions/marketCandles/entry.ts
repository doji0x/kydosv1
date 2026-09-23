import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { MARKET_CATALOG } from '../../shared/marketCatalog.js';
import { latestSnapshot } from '../../shared/marketDiscovery.js';
import { CandleError, chartInput, createCandleService } from '../../shared/marketCandles.js';

const candles = createCandleService();
async function requestBody(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length')) > 1024) throw new CandleError('invalid_input', 'Chart request is too large.', 400);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder(); let size = 0, body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 1024) { await reader.cancel(); throw new CandleError('invalid_input', 'Chart request is too large.', 400); }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally { reader.releaseLock(); }
}
export default async function(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
  try {
    const body = await requestBody(request);
    let input; try { input = chartInput(JSON.parse(body)); } catch (error) { if (error instanceof CandleError) throw error; throw new CandleError('invalid_input', 'Invalid chart request.', 400); }
    const client = createClientFromRequest(request), entities = client.asServiceRole.entities;
    // Bound public upstream work to catalog/discovery tokens or previously resolved markets.
    if (!MARKET_CATALOG.some(token => token.mint === input.mint)) {
      const known = await entities.MarketChartCache.filter({ namespace: 'gecko-charts-v1', cache_key: `selection:${input.mint}` }, '-started_at', 1);
      if (!known.length && !(await latestSnapshot(entities.MarketDiscoverySnapshot))?.tokens.some(token => token.mint === input.mint)) throw new CandleError('unlisted_mint', 'This mint is not in the available market catalog.', 404);
    }
    return Response.json(await candles(entities.MarketChartCache, input), { headers });
  } catch (error) {
    if (error instanceof CandleError) return Response.json({ error: error.message, code: error.code, retryAfter: error.retryAfter }, { status: error.status, headers: { ...headers, 'Retry-After': String(error.retryAfter) } });
    return Response.json({ error: 'Chart data is temporarily unavailable.', retryAfter: 60 }, { status: 503, headers });
  }
}
