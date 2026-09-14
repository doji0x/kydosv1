// Rolls indexed trades into OHLCV bars at 1m/5m/15m/1h/1d so the price chart renders
// entirely from Kydos-owned data.
//
// The roll covers each token's full indexed history by default (launch-to-now), so the
// RhCandle store becomes the complete series and the client never has to scan the chain
// for old blocks. Pass lookback_ms to roll only a recent window instead.
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
    // No lookback = the token's entire indexed history.
    const lookbackMs = Number(body.lookback_ms) || 0;
    const since = lookbackMs ? Date.now() - lookbackMs : 0;
    const maxTrades = Math.min(Number(body.max_trades) || 5000, 10_000);
    // Bars older than this many per interval are sealed and never rewritten.
    const tailBars = Math.min(Number(body.tail_bars) || 200, 2000);

    const tokens = await db.entities.RhToken.filter({ tracked: true });
    const summary = [];

    for (const token of tokens) {
      const trades = await listBounded(
        db,
        "RhTrade",
        since
          ? { token_address: token.address, block_time: { $gte: since } }
          : { token_address: token.address },
        "-block_time",
        maxTrades
      );
      if (!trades.length) {
        summary.push({ symbol: token.symbol, trades: 0, bars_written: 0 });
        continue;
      }

      let written = 0;
      for (const [interval, ms] of Object.entries(INTERVALS)) {
        const bars = rollCandles(trades, ms);
        // Only the tail of each interval can still change; older bars are already sealed.
        for (const bar of bars.slice(-tailBars)) {
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

      summary.push({
        symbol: token.symbol,
        trades: trades.length,
        oldest_trade: trades[trades.length - 1]?.block_time || null,
        bars_written: written,
      });
    }

    return Response.json({ since: since || "full-history", tail_bars: tailBars, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}