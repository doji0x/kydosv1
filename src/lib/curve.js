// Constant-product bonding curve with virtual reserves (pump.fun / Pons style).
export const TOTAL_SUPPLY = 1_000_000_000;
export const VIRTUAL_HOOD = 30;
export const VIRTUAL_TOKENS = 1_073_000_000;
export const GRADUATION_TARGET = 85; // HOOD in reserve to graduate
export const K = VIRTUAL_HOOD * VIRTUAL_TOKENS;

export function currentPrice(token) {
  const h = VIRTUAL_HOOD + (token.reserve || 0);
  const t = VIRTUAL_TOKENS - (token.tokens_sold || 0);
  return h / t;
}

export function marketCap(token) {
  return currentPrice(token) * TOTAL_SUPPLY;
}

export function quoteBuy(token, hoodIn) {
  const h = VIRTUAL_HOOD + (token.reserve || 0);
  const t = VIRTUAL_TOKENS - (token.tokens_sold || 0);
  const tokensOut = t - K / (h + hoodIn);
  return Math.max(0, Math.min(tokensOut, TOTAL_SUPPLY - (token.tokens_sold || 0)));
}

export function quoteSell(token, tokensIn) {
  const h = VIRTUAL_HOOD + (token.reserve || 0);
  const t = VIRTUAL_TOKENS - (token.tokens_sold || 0);
  const hoodOut = h - K / (t + tokensIn);
  return Math.max(0, Math.min(hoodOut, token.reserve || 0));
}

export function progress(token) {
  return Math.min(100, ((token.reserve || 0) / (token.graduation_target || GRADUATION_TARGET)) * 100);
}

export function fmtHood(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function fmtTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export function fmtPrice(p) {
  if (p >= 0.01) return p.toFixed(4);
  return p.toExponential(3);
}