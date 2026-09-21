// Read API: OHLCV bars for a tracked token at one interval.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { INTERVALS } from "../../shared/rhConstants.js";
import { listBounded } from "../../shared/rhStore.js";
import { isTrusted } from "../../shared/rhAudit.js";
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
    const beforeTime = Math.max(0, Math.floor(Number(body.before_time) || 0));
    const query = { token_address: address, interval };
    if (beforeTime) query.bucket_start = { $lt: beforeTime };

    const scanned = await listBounded(db, "RhCandle", query, "-bucket_start", Math.min(limit * 3, 1500));
    const rows = scanned.filter(isTrusted).slice(0, limit);

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
          revision: c.revision || 1,
        }))
        .sort((a, b) => a.t - b.t),
      next_before_time: rows.length >= limit ? rows[rows.length - 1]?.bucket_start || null : null,
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}