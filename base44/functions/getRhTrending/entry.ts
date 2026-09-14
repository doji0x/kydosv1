// Read API: every tracked token ranked for the board feed.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const sortKey = ["volume_24h", "change_24h", "market_cap"].includes(body.sort)
      ? body.sort
      : "volume_24h";

    const tokens = await db.entities.RhToken.filter({ tracked: true });
    const ranked = [...tokens].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

    return Response.json({
      sort: sortKey,
      tokens: ranked.map((t) => ({
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        icon_url: t.icon_url || null,
        price_usd: t.price_usd || 0,
        market_cap: t.market_cap || 0,
        fdv: t.fdv || 0,
        volume_24h: t.volume_24h || 0,
        liquidity_usd: t.liquidity_usd || 0,
        change_24h: t.change_24h || 0,
        buys_24h: t.buys_24h || 0,
        sells_24h: t.sells_24h || 0,
        holder_count: t.holder_count || 0,
        stats_updated_at: t.stats_updated_at || null,
      })),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}