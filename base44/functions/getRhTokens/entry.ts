// Public API: the full tracked-token directory with canonical market stats.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { tokenShape } from "../../shared/rhShape.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertApiCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
    const tokens = await db.entities.RhToken.filter({ tracked: true }, "-volume_24h", limit);

    return Response.json({
      chain_id: 4663,
      count: tokens.length,
      tokens: tokens.map(tokenShape),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}