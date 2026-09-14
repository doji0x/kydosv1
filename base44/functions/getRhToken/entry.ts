// Read API: canonical market stats for one tracked token, served from Kydos-indexed data.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getTokenRecord } from "../../shared/rhStore.js";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { tokenShape, poolShape } from "../../shared/rhShape.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertApiCaller(base44, req);
    if (denied) return denied;
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
      token: tokenShape(token),
      pools: pools.map(poolShape),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}