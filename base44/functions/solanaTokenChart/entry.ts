import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { canonicalFilter, readEventWindow, readNetwork } from '../../shared/solanaIndex.js';
import { chartTrade } from '../../shared/solanaEvents.js';
import { cachedAsset } from '../../shared/solanaAssets.js';
import { PROGRAM_ADDRESS, DECODER_VERSION, SOL_MINT } from '../../shared/solanaProtocol.js';
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await base44.auth.me())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const input = await req.json(), mint = String(input.mint || '').trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error('Valid Solana mint required');
    for (const cursor of [input.before, input.after]) if (cursor && !/^\d{16}:\d{16}:\d{16}$/.test(cursor)) throw new Error('Invalid chart cursor');
    const endpoint = secrets.get('HELIUS_RPC_URL');
    if (!endpoint) return Response.json({ error: 'HELIUS_RPC_URL is missing' }, { status: 503 });
    const network = await readNetwork(endpoint), filter = canonicalFilter(network.chain);
    if (input.chain && input.chain !== network.chain) return Response.json({ error: 'Chart network changed. Reload the market.' }, { status: 409 });
    const entities = base44.asServiceRole.entities;
    const [window, launches, states, token, sol] = await Promise.all([
      readEventWindow(entities.SolanaTrade, { ...filter, mint, side: { $in: ['buy', 'sell'] } }, { before: input.before, after: input.after }),
      entities.SolanaTrade.filter({ ...filter, mint, side: 'launch' }, 'order_key', 1),
      entities.SolanaIndexState.filter({ scope: `${network.chain}:${PROGRAM_ADDRESS}:v${DECODER_VERSION}` }, '-updated_date', 2),
      cachedAsset(endpoint, mint), network.cluster === 'mainnet-beta' ? cachedAsset(endpoint, SOL_MINT) : Promise.resolve({ asset: null, observedAt: null }),
    ]);
    const launch = launches[0], tokenInfo = token.asset?.token_info, price = Number(sol.asset?.token_info?.price_info?.price_per_token);
    const marketInfo = { name: launch?.name || token.asset?.content?.metadata?.name || null,
      symbol: launch?.symbol || tokenInfo?.symbol || token.asset?.content?.metadata?.symbol || null,
      image: token.asset?.content?.links?.image || null,
      supply: tokenInfo?.supply == null ? launch?.supply_raw || null : String(tokenInfo.supply),
      decimals: Number.isInteger(tokenInfo?.decimals) ? tokenInfo.decimals : launch?.decimals ?? null,
      solUsdPrice: Number.isFinite(price) && price > 0 ? price : null, solUsdObservedAt: sol.observedAt };
    const state = states[0];
    return Response.json({ trades: window.events.map(chartTrade), marketInfo, network, nextBefore: window.nextBefore, nextAfter: window.nextAfter, hasMore: window.hasMore,
      source: 'Kydos finalized events', coverage: { indexedThrough: state?.last_synced_at || null, historyComplete: !!state?.history_complete, catchingUp: !!state?.live_before,
        error: states.length > 1 ? 'Duplicate index checkpoints; reconciliation required' : state?.last_error || null, configured: !!state }, servedAt: Date.now() });
  } catch (error) { return Response.json({ error: String(error.message).replace(/https?:\/\/\S+/g, '[RPC endpoint]') }, { status: 503 }); }
}
