// Rolls indexed trades into OHLCV bars at 1m/5m/15m/1h/1d so the price chart renders
// entirely from Kydos-owned data.
//
// The roll covers each token's full indexed history by default (launch-to-now), so the
// RhCandle store becomes the complete series and the client never has to scan the chain
// for old blocks. Pass lookback_ms to roll only a recent window instead.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { INTERVALS } from "../../shared/rhConstants.js";
import { rollCandles } from "../../shared/rhMarket.js";
import { isTrusted } from "../../shared/rhAudit.js";
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

    const tokens = body.token_address
      ? await db.entities.RhToken.filter({ address: String(body.token_address).toLowerCase() })
      : await db.entities.RhToken.filter({ tracked: true });
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
      const pools = await db.entities.RhPool.filter({ token_address: token.address, active: true });
      const blockedPools = new Set(pools.filter((p) => p.trust_status === "SUSPENDED" || p.trust_status === "PROBATION").map((p) => p.address));
      const trustedTrades = trades.filter((trade) => isTrusted(trade) && !blockedPools.has(trade.pool));
      if (!trustedTrades.length) {
        summary.push({ symbol: token.symbol, trades: 0, bars_written: 0 });
        continue;
      }

      let written = 0;
      for (const [interval, ms] of Object.entries(INTERVALS)) {
        const bars = rollCandles(trustedTrades, ms);
        // Only the tail of each interval can still change; older bars are already sealed.
        for (const bar of bars.slice(-tailBars)) {
          const uid = `${token.address}-${interval}-${bar.bucket_start}`;
          const prior = (await db.entities.RhCandle.filter({ uid }))[0];
          const changed = prior && ["open", "high", "low", "close", "volume_usd", "trades"].some((key) => prior[key] !== bar[key]);
          await upsertByUid(db, "RhCandle", uid, {
            token_address: token.address,
            interval,
            bucket_start: bar.bucket_start,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume_usd: bar.volume_usd,
            trades: bar.trades,
            status: changed || ["SUSPECT", "QUARANTINED", "INVALID"].includes(prior?.status) ? "REPAIRED" : (prior?.status || "VERIFIED"),
            revision: changed ? (prior.revision || 1) + 1 : (prior?.revision || 1),
            verification_method: "deterministic",
          });
          written += 1;
        }
      }

      summary.push({
        symbol: token.symbol,
        trades: trustedTrades.length,
        oldest_trade: trustedTrades[trustedTrades.length - 1]?.block_time || null,
        bars_written: written,
      });
    }

    return Response.json({ since: since || "full-history", tail_bars: tailBars, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}