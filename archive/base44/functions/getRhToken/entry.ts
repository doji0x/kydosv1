// Read API: canonical market stats for one tracked token, served from Kydos-indexed data.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getTokenRecord } from "../../shared/rhStore.js";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { tokenShape, poolShape } from "../../shared/rhShape.js";
import { loadTokenBranding } from "../../shared/rhMetadata.js";

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

    const allPools = await db.entities.RhPool.filter({ token_address: address, active: true });
    const pools = allPools.filter((pool) => !pool.trust_status || pool.trust_status === "TRUSTED");
    const branded = await loadTokenBranding(db, token).catch((error) => {
      console.warn("Token branding unavailable", error.message);
      return token;
    });
    const published = token.market_status === "UNAVAILABLE"
      ? { ...branded, price_usd: 0, price_quote: 0, market_cap: 0, fdv: 0 }
      : branded;

    return Response.json({
      token: tokenShape(published),
      pools: pools.map(poolShape),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}