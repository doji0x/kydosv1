// Read API: holder count and top holders for a tracked token, from indexed balances.
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
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);

    const token = await getTokenRecord(db, address);
    const rows = await db.entities.RhBalance.filter(
      { token_address: address, is_pool: false },
      "-balance",
      500
    );
    const held = rows.filter((r) => (r.balance || 0) > 0);
    const supply = token?.total_supply || 0;

    return Response.json({
      holder_count: held.length,
      top_holders: held.slice(0, limit).map((r) => ({
        wallet: r.wallet,
        balance: r.balance,
        share_pct: supply ? (r.balance / supply) * 100 : 0,
      })),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}