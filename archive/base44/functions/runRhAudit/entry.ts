import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { findTradeAnomalies, findCandleAnomalies } from "../../shared/rhAudit.js";
import { reviewAnomaly } from "../../shared/rhOpenAiAudit.js";
import { refetchTrade } from "../../shared/rhRepair.js";

const snapshot = (row) => row ? ({ price_usd: row.price_usd, price_quote: row.price_quote, volume_usd: row.volume_usd,
  open: row.open, high: row.high, low: row.low, close: row.close }) : {};
const rank = (severity) => Number(String(severity).split("-")[1]) || 1;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const expected = secrets.get("RH_CRON_SECRET");
    const provided = req.headers.get("x-kydos-cron") || body.secret;
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!expected || (provided !== expected && user?.role !== "admin")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = base44.asServiceRole;
    const maxReviews = Math.min(Math.max(Number(body.max_reviews) || 3, 1), 10);
    const since = Date.now() - Math.min(Number(body.lookback_ms) || 1_200_000, 86_400_000);
    const tokens = body.token_address
      ? await db.entities.RhToken.filter({ address: String(body.token_address).toLowerCase() })
      : await db.entities.RhToken.filter({ tracked: true });
    const candidates = [];

    for (const token of tokens) {
      const pools = await db.entities.RhPool.filter({ token_address: token.address, active: true });
      const expired = pools.filter((pool) => pool.trust_status === "SUSPENDED" && (pool.suspended_until || 0) <= Date.now());
      for (const pool of expired) await db.entities.RhPool.update(pool.id, { trust_status: "PROBATION" });
      const trades = await db.entities.RhTrade.filter({ token_address: token.address, block_time: { $gte: since } }, "-block_time", 500);
      const candles = await db.entities.RhCandle.filter({ token_address: token.address, bucket_start: { $gte: since } }, "-bucket_start", 500);
      const tokenCandidates = [...findTradeAnomalies(trades, pools), ...findCandleAnomalies(candles)];
      for (const pool of expired) {
        if (!tokenCandidates.some((item) => item.trade?.pool === pool.address)) {
          await db.entities.RhPool.update(pool.id, { trust_status: "TRUSTED", suspended_until: 0, suspension_reason: "" });
          if (token.market_status === "DEGRADED") await db.entities.RhToken.update(token.id, { market_status: "OK", market_status_reason: "" });
        }
      }
      candidates.push(...tokenCandidates);
    }

    const results = [];
    for (const candidate of candidates.slice(0, maxReviews)) {
      const row = candidate.trade || candidate.candle;
      const tokenAddress = row.token_address;
      const source = candidate.trade?.pool || "";
      const uid = `audit:${candidate.target}:${candidate.reason}`;
      const existing = await db.entities.RhAuditEvent.filter({ uid });
      if (existing.length) continue;
      const recentSourceEvents = source ? await db.entities.RhAuditEvent.filter({ source_address: source, audited_at: { $gte: Date.now() - 1_200_000 } }) : [];
      let effectiveSeverity = recentSourceEvents.length >= 20 ? "SEV-4" : recentSourceEvents.length >= 11 ? "SEV-3" : candidate.severity;
      const event = await db.entities.RhAuditEvent.create({
        uid, scope: candidate.scope, target: candidate.target, token_address: tokenAddress,
        source_address: source, status: "OPEN", verification_method: "deterministic",
        anomaly_reason: candidate.reason, original_value: snapshot(row), severity: effectiveSeverity,
        audited_at: Date.now()
      });
      let verdict;
      try {
        verdict = await reviewAnomaly({
          scope: candidate.scope, reason: candidate.reason, severity: effectiveSeverity,
          source, source_anomalies_20m: recentSourceEvents.length + 1,
          observed: snapshot(row), timestamp: row.block_time || row.bucket_start || 0
        });
      } catch (error) {
        if (candidate.trade) await db.entities.RhTrade.update(candidate.trade.id, { status: "QUARANTINED", verification_method: "model_unavailable" });
        if (candidate.candle) await db.entities.RhCandle.update(candidate.candle.id, { status: "QUARANTINED", verification_method: "model_unavailable" });
        await db.entities.RhAuditEvent.update(event.id, { status: "QUARANTINED", model_reason: error.message });
        results.push({ target: candidate.target, status: "QUARANTINED", reason: "model unavailable" });
        continue;
      }
      const reviewed = {
        verification_method: "gpt-4o-mini", model_confidence: Math.max(0, Math.min(Number(verdict.confidence) || 0, 1)),
        model_reason: verdict.reason, recommended_action: verdict.recommended_action,
        affected_from: verdict.affected_from || row.block_time || row.bucket_start,
        affected_to: verdict.affected_to || (row.block_time || row.bucket_start) + 60_000
      };
      if (verdict.verdict === "IGNORE" || verdict.recommended_action === "IGNORE") {
        await db.entities.RhAuditEvent.update(event.id, { ...reviewed, status: "IGNORED" });
        results.push({ target: candidate.target, status: "IGNORED" });
        continue;
      }

      if (candidate.trade) await db.entities.RhTrade.update(candidate.trade.id, { status: "QUARANTINED", verification_method: "gpt-4o-mini" });
      if (candidate.candle) await db.entities.RhCandle.update(candidate.candle.id, { status: "QUARANTINED", verification_method: "gpt-4o-mini" });
      let repaired = null;
      if (candidate.trade && ["REFETCH", "REBUILD", "QUARANTINE"].includes(verdict.recommended_action)) {
        repaired = await refetchTrade(db, candidate.trade);
        if (repaired) {
          const references = await db.entities.RhTrade.filter({ token_address: tokenAddress, block_time: { $gte: repaired.block_time - 1_200_000, $lte: repaired.block_time + 1_200_000 } }, "-block_time", 100);
          const pools = await db.entities.RhPool.filter({ token_address: tokenAddress, active: true });
          const stillBad = findTradeAnomalies([repaired, ...references], pools).some((item) => item.target === repaired.uid);
          if (stillBad) repaired = null;
        }
        if (repaired) await db.entities.RhTrade.create(repaired);
      }
      if (verdict.recommended_action === "EXCLUDE_SOURCE" && source) {
        const poolRows = await db.entities.RhPool.filter({ address: source });
        if (poolRows[0]) await db.entities.RhPool.update(poolRows[0].id, {
          trust_status: "SUSPENDED", suspended_until: Date.now() + 3_600_000, suspension_reason: verdict.reason
        });
        const tokenRows = await db.entities.RhToken.filter({ address: tokenAddress });
        const remaining = await db.entities.RhPool.filter({ token_address: tokenAddress, active: true });
        const hasTrusted = remaining.some((pool) => pool.address !== source && (!pool.trust_status || pool.trust_status === "TRUSTED"));
        effectiveSeverity = hasTrusted && rank(effectiveSeverity) < 3 ? "SEV-3" : !hasTrusted ? "SEV-5" : effectiveSeverity;
        if (tokenRows[0]) await db.entities.RhToken.update(tokenRows[0].id, {
          market_status: hasTrusted ? "DEGRADED" : "UNAVAILABLE",
          market_status_reason: hasTrusted ? verdict.reason : "INSUFFICIENT_TRUSTED_DATA"
        });
      }
      let rebuildError = "";
      if (candidate.trade || candidate.candle || verdict.recommended_action === "REBUILD") {
        try {
          await base44.asServiceRole.functions.invoke("buildRhCandles", { token_address: tokenAddress, lookback_ms: 86_400_000, tail_bars: 2000 });
        } catch (error) {
          rebuildError = error.message;
        }
      }
      let status = repaired ? "REPAIRED" : "INVALID";
      let method = "gpt-4o-mini";
      if (!repaired && rank(effectiveSeverity) >= 3) {
        try {
          const strong = await reviewAnomaly({ reason: candidate.reason, prior_verdict: verdict, repair_result: "FAILED" }, true);
          method = "gpt-4o";
          reviewed.model_reason = strong.reason;
          status = "ESCALATED";
        } catch { status = "INVALID"; }
      }
      await db.entities.RhAuditEvent.update(event.id, {
        ...reviewed, status, verification_method: method, severity: effectiveSeverity,
        corrected_value: repaired ? snapshot(repaired) : undefined,
        repair_source: repaired ? "CHAIN_RECEIPT_REDECODE" : undefined
      });
      if (!repaired && candidate.trade) await db.entities.RhTrade.update(candidate.trade.id, { status: "INVALID" });
      results.push({ target: candidate.target, status, action: verdict.recommended_action, rebuild_error: rebuildError || null });
    }
    return Response.json({ scanned: candidates.length, reviewed: results.length, capped_at: maxReviews, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}