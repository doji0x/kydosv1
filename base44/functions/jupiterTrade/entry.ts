import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { getTradeOrder, executeTrade, invalid } from '../../shared/jupiterTrading.js';
import { swapBalances } from '../../shared/jupiterBalances.js';

const windows = new Map();
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const client = createClientFromRequest(req);
    if (!await client.auth.isAuthenticated()) return Response.json({ error: 'Sign in to trade.' }, { status: 401 });
    const user = await client.auth.me(), now = Date.now();
    // Bounded per-instance protection; provider limits remain the global backstop.
    for (const [key, item] of windows) if (item.until <= now) windows.delete(key);
    const window = windows.get(user.id) || { count: 0, until: now + 60000 };
    if (++window.count > 45) throw invalid('Too many trading requests. Please wait a minute.', 429);
    windows.set(user.id, window);
    const text = await req.text();
    if (text.length > 6000) throw invalid('Trade request is too large.', 413);
    let input;
    try { input = JSON.parse(text); } catch { throw invalid('Invalid trade request.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || !['balances', 'order', 'execute'].includes(input.action)) throw invalid('Invalid trading action.');
    let result;
    if (input.action === 'balances') result = await swapBalances(input, secrets.get('HELIUS_RPC_URL'));
    if (input.action === 'order') result = await getTradeOrder(input, secrets.get('JUP_API_KEY'));
    if (input.action === 'execute') result = await executeTrade(input, secrets.get('JUP_API_KEY'));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Jupiter trading failure', error.name, String(error.message).replace(/https?:\/\/\S+/g, '[upstream]'));
    const status = Number.isInteger(error.status) ? error.status : 503;
    return Response.json({ error: error.status ? error.message : 'Trading is temporarily unavailable. If you already approved a trade, check its transaction status before trying again.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}