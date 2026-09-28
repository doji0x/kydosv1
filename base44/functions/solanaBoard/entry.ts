import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { canonicalFilter, readNetwork, readEventWindow } from '../../shared/solanaIndex.js';
import { uniqueEvents } from '../../shared/solanaEvents.js';
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const endpoint = secrets.get('HELIUS_RPC_URL'); if (!endpoint) throw new Error('HELIUS_RPC_URL is missing');
    const network = await readNetwork(endpoint), filter = canonicalFilter(network.chain), entity = base44.entities.SolanaTrade;
    const launches = uniqueEvents(await entity.filter({ ...filter, side: 'launch' }, '-order_key', 200));
    const tokens = new Map(launches.map(launch => [launch.mint, { mint: launch.mint, name: launch.name, symbol: launch.symbol, latest: launch.block_time, trades: 0, buys: 0, volume: 0 }]));
    const since = Math.floor(Date.now() / 1000) - 86400;
    let before, hasMore = false;
    for (let page = 0; page < 10 && tokens.size; page++) {
      const window = await readEventWindow(entity, { ...filter, mint: { $in: [...tokens.keys()] }, side: { $in: ['buy', 'sell'] }, block_time: { $gte: since } }, { before, limit: 500 });
      for (const trade of window.events) { const token = tokens.get(trade.mint); token.trades++; token.buys += trade.side === 'buy' ? 1 : 0; token.volume += trade.sol_amount; }
      hasMore = window.hasMore; before = window.nextBefore; if (!hasMore) break;
    }
    const partial = hasMore;
    return Response.json({ network, tokens: [...tokens.values()].sort((a, b) => partial ? b.latest - a.latest : b.volume - a.volume || b.latest - a.latest), partial, windowStart: since, marketLimit: 200 });
  } catch (error) { return Response.json({ error: String(error.message).replace(/https?:\/\/\S+/g, '[RPC endpoint]') }, { status: 503 }); }
}