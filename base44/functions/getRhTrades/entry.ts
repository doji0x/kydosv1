// Read API: recent normalized trades for a tracked token.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { listBounded } from "../../shared/rhStore.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const address = String(body.address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      return Response.json({ error: "A valid token address is required" }, { status: 400 });
    }
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

    const trades = await listBounded(db, "RhTrade", { token_address: address }, "-block_time", limit);

    return Response.json({
      trades: trades.map((t) => ({
        side: t.side,
        venue: t.venue,
        pool: t.pool,
        trader: t.trader,
        token_amount: t.token_amount,
        quote_amount: t.quote_amount,
        price_usd: t.price_usd,
        volume_usd: t.volume_usd,
        block_number: t.block_number,
        block_time: t.block_time,
        tx_hash: t.tx_hash,
      })),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}