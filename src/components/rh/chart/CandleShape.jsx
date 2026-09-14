import React from "react";

// Custom recharts shape: the bar spans low→high, and open/close are positioned inside
// that pixel range, so no access to the chart scale is needed.
export default function CandleShape({ x, y, width, height, payload, formingIndex, index }) {
  const { open, close, high, low } = payload || {};
  if (![open, close, high, low].every((v) => typeof v === "number")) return null;

  const span = high - low;
  const priceToY = (p) => (span > 0 ? y + ((high - p) / span) * height : y + height / 2);

  const up = close >= open;
  const color = up ? "hsl(var(--chart-2))" : "hsl(var(--chart-3))";
  const forming = index === formingIndex;

  const bodyTop = priceToY(Math.max(open, close));
  const bodyBottom = priceToY(Math.min(open, close));
  const bodyH = Math.max(bodyBottom - bodyTop, 1);
  const bodyW = Math.max(width * 0.62, 1);
  const bodyX = x + (width - bodyW) / 2;
  const wickX = x + width / 2;

  return (
    <g opacity={forming ? 0.85 : 1}>
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={0.5} />
      {forming && <circle cx={wickX} cy={priceToY(close)} r={2.5} fill={color} className="animate-pulse" />}
    </g>
  );
}