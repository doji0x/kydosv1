import { isUsableTrade, rollCandles } from "./rhMarket.js";
import { INTERVALS } from "./rhConstants.js";

export const TRUSTED_STATUSES = ["VERIFIED", "REPAIRED"];
export const isTrusted = (row) => !row.status || TRUSTED_STATUSES.includes(row.status);

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

export function findTradeAnomalies(trades, pools) {
  const poolMap = new Map(pools.map((p) => [p.address, p]));
  const baseline = median(trades.filter(isTrusted).slice(0, 100).map((t) => t.price_usd));
  const seen = new Set();
  const out = [];
  for (const trade of trades) {
    if (!isTrusted(trade)) continue;
    let reason = "";
    let severity = "SEV-1";
    if (seen.has(trade.uid)) reason = "Duplicate trade uid";
    seen.add(trade.uid);
    if (!reason && !isUsableTrade(trade)) reason = "Malformed or dust-normalized trade";
    if (!reason && baseline > 0 && Math.abs(trade.price_usd - baseline) / baseline > 0.35) {
      reason = `Price deviates ${Math.round(Math.abs(trade.price_usd - baseline) / baseline * 100)}% from recent market median`;
      severity = "SEV-2";
    }
    const liquidity = poolMap.get(trade.pool)?.liquidity_usd || 0;
    if (!reason && liquidity > 0 && trade.volume_usd > liquidity * 3) {
      reason = "Trade volume is implausible relative to pool liquidity";
      severity = "SEV-2";
    }
    if (reason) out.push({ scope: "trade", target: trade.uid, trade, reason, severity });
  }
  return out;
}

export function findCandleAnomalies(candles) {
  const out = [];
  const grouped = new Map();
  for (const candle of candles.filter(isTrusted)) {
    const sane = Number.isFinite(candle.open) && candle.low <= Math.min(candle.open, candle.close)
      && candle.high >= Math.max(candle.open, candle.close) && candle.low > 0;
    if (!sane) out.push({ scope: "candle", target: candle.uid, candle, reason: "Invalid OHLC relationship", severity: "SEV-2" });
    const key = `${candle.token_address}:${candle.interval}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candle);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => a.bucket_start - b.bucket_start);
    const step = INTERVALS[rows[0]?.interval];
    for (let i = 1; step && i < rows.length; i++) {
      if (rows[i].bucket_start - rows[i - 1].bucket_start > step * 12) {
        out.push({ scope: "candle", target: rows[i].uid, candle: rows[i], reason: "Large unexplained candle-series gap", severity: "SEV-1" });
      }
    }
  }
  return out;
}

export function rebuildBars(trades, interval, from, to) {
  return rollCandles(trades.filter((t) => isTrusted(t) && t.block_time >= from && t.block_time < to), INTERVALS[interval]);
}