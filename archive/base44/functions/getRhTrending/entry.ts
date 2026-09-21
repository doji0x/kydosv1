// Read API: every tracked token ranked for the board feed.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { tokenShape } from "../../shared/rhShape.js";
import { CHAIN_ID } from "../../shared/rhRpc.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertApiCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const sortKey = ["volume_24h", "change_24h", "market_cap"].includes(body.sort)
      ? body.sort
      : "volume_24h";

    const tokens = await db.entities.RhToken.filter({ tracked: true, chain_id: CHAIN_ID });
    const ranked = [...tokens].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

    return Response.json({
      sort: sortKey,
      tokens: ranked.map(tokenShape),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}