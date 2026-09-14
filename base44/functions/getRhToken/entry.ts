// Read API: canonical market stats for one tracked token, served from Kydos-indexed data.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getTokenRecord } from "../../shared/rhStore.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const address = String(body.address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      return Response.json({ error: "A valid token address is required" }, { status: 400 });
    }

    const token = await getTokenRecord(db, address);
    if (!token) return Response.json({ error: "Token is not tracked by Kydos" }, { status: 404 });

    const pools = await db.entities.RhPool.filter({ token_address: address, active: true });

    return Response.json({
      token: {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        total_supply: token.total_supply,
        icon_url: token.icon_url || null,
        website: token.website || null,
        twitter: token.twitter || null,
        telegram: token.telegram || null,
        price_usd: token.price_usd || 0,
        price_quote: token.price_quote || 0,
        market_cap: token.market_cap || 0,
        fdv: token.fdv || 0,
        volume_24h: token.volume_24h || 0,
        liquidity_usd: token.liquidity_usd || 0,
        change_1h: token.change_1h || 0,
        change_6h: token.change_6h || 0,
        change_24h: token.change_24h || 0,
        buys_24h: token.buys_24h || 0,
        sells_24h: token.sells_24h || 0,
        trades_24h: token.trades_24h || 0,
        holder_count: token.holder_count || 0,
        pool_count: token.pool_count || 0,
        last_indexed_block: token.last_indexed_block || 0,
        stats_updated_at: token.stats_updated_at || null,
      },
      pools: pools.map((p) => ({
        address: p.address,
        venue: p.venue,
        quote_symbol: p.quote_symbol,
        liquidity_usd: p.liquidity_usd || 0,
        fee: p.fee || null,
      })),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}