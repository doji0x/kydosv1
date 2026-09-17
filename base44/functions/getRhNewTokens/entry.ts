// Public API: the newest Kydos launches, newest first.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { curveTokenShape } from "../../shared/rhShape.js";
import { statsBySymbol } from "../../shared/rhCurveLink.js";
import { CHAIN_ID } from "../../shared/rhRpc.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertApiCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
    const tokens = await db.entities.Token.filter({ chain_id: CHAIN_ID }, "-created_date", limit);
    const stats = await statsBySymbol(db);

    return Response.json({
      count: tokens.length,
      tokens: tokens.map((t) => curveTokenShape(t, stats.get((t.ticker || "").toLowerCase()))),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}