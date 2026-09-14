// Read API: OHLCV bars for a tracked token at one interval.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { INTERVALS } from "../../shared/rhConstants.js";
import { listBounded } from "../../shared/rhStore.js";
import { assertApiCaller } from "../../shared/rhApiKey.js";

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
    const interval = String(body.interval || "5m");
    if (!INTERVALS[interval]) {
      return Response.json(
        { error: `interval must be one of ${Object.keys(INTERVALS).join(", ")}` },
        { status: 400 }
      );
    }
    const limit = Math.min(Math.max(Number(body.limit) || 120, 1), 500);

    const rows = await listBounded(
      db,
      "RhCandle",
      { token_address: address, interval },
      "-bucket_start",
      limit
    );

    return Response.json({
      interval,
      candles: rows
        .map((c) => ({
          t: c.bucket_start,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume_usd: c.volume_usd || 0,
          trades: c.trades || 0,
        }))
        .sort((a, b) => a.t - b.t),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}