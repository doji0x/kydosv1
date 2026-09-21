import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { fetchHeliusTradePage } from '../../shared/heliusSolanaTrades.ts';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

async function getFungibleAsset(endpoint: string, id: string) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `asset-${id}`, method: 'getAsset', params: { id, options: { showFungible: true } } }) });
  if (!response.ok) throw new Error(`Helius asset request failed: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Helius asset request failed');
  return data.result;
}

const assetPrice = (asset: any) => {
  const value = Number(asset?.token_info?.price_info?.price_per_token);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const input = await req.json();
    const mint = String(input.mint || '').trim();
    const sinceValue = input.since == null ? null : input.since;
    const sinceTime = Number(sinceValue);
    const pages = Math.min(5, Math.max(1, Number(input.pages) || 1));
    const apiKey = secrets.get('HELIUS_API_KEY') || secrets.get('HELIUS_PARSE_TRANSACTION_HISTORY_API_KEY');
    if (!apiKey) return Response.json({ error: 'Helius history key is missing' }, { status: 503 });
    const rpcEndpoint = secrets.get('HELIUS_RPC_URL') || `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    let before = input.before ? String(input.before) : undefined;
    let scanned = 0;
    for (let page = 0; page < pages; page++) {
      const result = await fetchHeliusTradePage({ mint, apiKey, before, limit: sinceValue ? 50 : 100 });
      scanned += result.scanned;
      const existing = result.signatures.length ? await base44.asServiceRole.entities.SolanaTrade.filter({ mint, signature: { $in: result.signatures } }) : [];
      const bySignature = new Map(existing.map((row: any) => [row.signature, row]));
      const normalized = new Set(result.rows.map((row: any) => row.signature));
      const stale = existing.filter((row: any) => !normalized.has(row.signature)).map((row: any) => row.id);
      if (stale.length) await base44.asServiceRole.entities.SolanaTrade.deleteMany({ id: { $in: stale } });
      const additions = result.rows.filter((row: any) => !bySignature.has(row.signature));
      const updates = result.rows.filter((row: any) => bySignature.has(row.signature)).map((row: any) => ({ id: bySignature.get(row.signature).id, ...row }));
      if (additions.length) await base44.asServiceRole.entities.SolanaTrade.bulkCreate(additions);
      if (updates.length) await base44.asServiceRole.entities.SolanaTrade.bulkUpdate(updates);
      before = result.nextBefore || undefined;
      if (result.scanned < 100 || !before) break;
    }
    const rows = await base44.asServiceRole.entities.SolanaTrade.filter({ mint }, '-block_time', 500);
    const validRows = rows.filter((row: any) => row.status === 'confirmed' && row.block_time > 0 && row.sol_amount > 0 && row.token_amount > 0);
    const ordered = [...validRows].sort((a: any, b: any) => a.block_time - b.block_time);
    let requested = ordered;
    if (Number.isFinite(sinceTime) && sinceTime > 0) requested = ordered.filter((row: any) => row.block_time >= sinceTime);
    else if (typeof sinceValue === 'string') {
      const marker = ordered.find((row: any) => row.signature === sinceValue);
      if (marker) requested = ordered.filter((row: any) => row.block_time >= marker.block_time);
    }
    const trades = requested.map((row: any) => ({ signature: row.signature, blockTime: row.block_time,
      price: row.sol_amount / row.token_amount, side: row.side, solAmount: row.sol_amount, tokenAmount: row.token_amount }));
    const [tokenResult, solResult] = await Promise.allSettled([
      getFungibleAsset(rpcEndpoint, mint), getFungibleAsset(rpcEndpoint, SOL_MINT),
    ]);
    const tokenAsset = tokenResult.status === 'fulfilled' ? tokenResult.value : null;
    const solAsset = solResult.status === 'fulfilled' ? solResult.value : null;
    const tokenInfo = tokenAsset?.token_info;
    const marketInfo = { name: tokenAsset?.content?.metadata?.name || null,
      symbol: tokenInfo?.symbol || tokenAsset?.content?.metadata?.symbol || null,
      supply: tokenInfo?.supply == null ? null : String(tokenInfo.supply),
      decimals: Number.isInteger(tokenInfo?.decimals) ? tokenInfo.decimals : null,
      tokenUsdPrice: assetPrice(tokenAsset), solUsdPrice: assetPrice(solAsset) };
    return Response.json({ trades, marketInfo, tradeCount: validRows.length, earliest: ordered[0]?.block_time || null,
      latest: ordered.at(-1)?.block_time || null, nextBefore: before || null, scanned });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}