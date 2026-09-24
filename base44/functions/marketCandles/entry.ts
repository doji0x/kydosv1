import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { CandleError, chartInput, noteChartInterest, readJupiterCandles } from '../../shared/marketCandles.js';
import { readMarketRequest } from '../../shared/marketRequest.js';


export default async function(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
  try {
    const input = chartInput(await readMarketRequest(request));
    // Public, user-scoped reads honor the candle entity's read-only public access.
    const entities = createClientFromRequest(request).entities;
    if (!input.before) await noteChartInterest(entities.MarketChartInterest, input.mint).catch(() => { /* An optional interest hint must never block a public chart read. */ });
    return Response.json(await readJupiterCandles(entities.JupiterCandle, input), { headers });
  } catch (error) {
    if (error instanceof CandleError || error.status === 400) {
      return Response.json({ error: error.message, code: error.code || 'invalid_input', retryAfter: error.retryAfter || 60 }, { status: error.status, headers });
    }
    return Response.json({ error: 'Chart data is temporarily unavailable.', retryAfter: 60 }, { status: 503, headers });
  }
}