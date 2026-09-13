import React from "react";

export default function ProgressRing({ pct, size = 44, stroke = 3, graduated }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = graduated ? 100 : pct;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(0 0% 100% / 0.12)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={graduated ? "hsl(150 60% 50%)" : "hsl(42 96% 56%)"}
          strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * p) / 100}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold">
        {graduated ? "✓" : `${Math.round(p)}`}
      </span>
    </div>
  );
}