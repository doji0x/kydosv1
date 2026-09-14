import { fmtUsdPrice } from "@/lib/format";

export const TRILLION = 1e12;
export function formatChartValue(value, mode = "price") {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  if (mode === "price" && Math.abs(value) < 1000) return fmtUsdPrice(value);
  const unit = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]].find(([n]) => Math.abs(value) >= n);
  return unit ? `$${Number((value / unit[0]).toFixed(2))}${unit[1]}` : `$${Number(value.toPrecision(4))}`;
}

// Convert display units only; indicator calculations and the stored series stay in price.
export function scaleChartRows(rows, multiplier) {
  if (multiplier === 1) return rows;
  return rows.map((row) => {
    const next = { ...row };
    for (const key of ["open", "high", "low", "close", "ema9", "ema21", "ema50", "bbUpper", "bbMiddle", "bbLower", "vwap"]) {
      if (Number.isFinite(row[key])) next[key] = row[key] * multiplier;
    }
    next.hl = [next.low, next.high];
    return next;
  });
}

export function chartDomain(rows, depth, yZoom, yShift) {
  if (!rows.length) return [0, 1];
  const min = Math.min(...rows.map((r) => r.low));
  const max = Math.max(...rows.map((r) => r.high));
  const pad = (max - min || max * 0.01 || 1) * 0.08;
  const progress = Math.max(0, Math.min(1, depth));
  const fitTop = Math.min(TRILLION, Math.max(Number.MIN_VALUE, max + pad));
  // Interpolate in orders of magnitude so early zoom steps remain readable.
  const top = progress === 1 ? TRILLION : Math.exp(Math.log(fitTop) + progress * (Math.log(TRILLION) - Math.log(fitTop)));
  const bottom = Math.max(0, min - pad) * (1 - progress);
  const span = Math.min(TRILLION, (top - bottom) / (yZoom || 1));
  const center = (bottom + top) / 2 + yShift * span;
  const low = Math.max(0, Math.min(TRILLION - span, center - span / 2));
  return [low, low + span];
}