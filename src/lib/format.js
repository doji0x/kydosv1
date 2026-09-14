// Display formatters for USD market data.
export function fmtUsd(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function fmtUsdPrice(n) {
  if (!n) return "—";
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

export function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtAmount(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export const pctTone = (n) =>
  !n ? "text-muted-foreground" : n > 0 ? "text-emerald-400" : "text-red-400";