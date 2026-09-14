// Rolls indexed trades into OHLCV bars at 1m/5m/15m/1h/1d so the price chart renders
// entirely from Kydos-owned data.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { INTERVALS } from "../../shared/rhConstants.js";
import { rollCandles } from "../../shared/rhMarket.js";
import { listBounded, upsertByUid } from "../../shared/rhStore.js";
import { assertEngineCaller } from "../../shared/rhAuth.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const lookbackMs = Math.min(Number(body.lookback_ms) || 6 * 3_600_000, 7 * 86_400_000);
    const since = Date.now() - lookbackMs;

    const tokens = await db.entities.RhToken.filter({ tracked: true });
    const summary = [];

    for (const token of tokens) {
      const trades = await listBounded(
        db,
        "RhTrade",
        { token_address: token.address, block_time: { $gte: since } },
        "-block_time",
        3000
      );
      if (!trades.length) {
        summary.push({ symbol: token.symbol, trades: 0, bars_written: 0 });
        continue;
      }

      let written = 0;
      for (const [interval, ms] of Object.entries(INTERVALS)) {
        const bars = rollCandles(trades, ms);
        // Only the tail of each interval can still change; older bars are already sealed.
        for (const bar of bars.slice(-200)) {
          await upsertByUid(db, "RhCandle", `${token.address}-${interval}-${bar.bucket_start}`, {
            token_address: token.address,
            interval,
            bucket_start: bar.bucket_start,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume_usd: bar.volume_usd,
            trades: bar.trades,
          });
          written += 1;
        }
      }

      summary.push({ symbol: token.symbol, trades: trades.length, bars_written: written });
    }

    return Response.json({ since, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}