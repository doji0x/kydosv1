// Layout + scale helpers for the canvas candle chart.
export const AXIS_W = 76;
export const TIME_H = 22;
export const RIGHT_PAD_BARS = 4;

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));

const hsl = (el, name) => `hsl(${getComputedStyle(el).getPropertyValue(name).trim()})`;

export function palette(el) {
  return {
    up: hsl(el, "--chart-2"),
    down: hsl(el, "--chart-3"),
    grid: hsl(el, "--border"),
    text: hsl(el, "--muted-foreground"),
    fg: hsl(el, "--foreground"),
    bg: hsl(el, "--card"),
    primary: hsl(el, "--primary"),
    c4: hsl(el, "--chart-4"),
    c5: hsl(el, "--chart-5"),
    font: `10px ${getComputedStyle(el).fontFamily}`,
  };
}

export function fmtTime(t, timeframe) {
  const d = new Date(t);
  if (timeframe === "1d") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (timeframe === "1h") return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", hour12: false });
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", ...(timeframe.endsWith("s") ? { second: "2-digit" } : {}), hour12: false });
}

// endIndex is the (fractional) bar index sitting on the plot's right edge.
export function makeScales({ width, height, endIndex, barW, domain }) {
  const plotW = Math.max(width - AXIS_W, 1);
  const plotH = Math.max(height - TIME_H, 1);
  const span = domain[1] - domain[0] || 1;
  return {
    plotW,
    plotH,
    x: (i) => plotW - (endIndex - i) * barW,
    y: (v) => ((domain[1] - v) / span) * plotH,
    idxAt: (px) => Math.round(endIndex - (plotW - px) / barW),
    valAt: (py) => domain[1] - (py / plotH) * span,
  };
}