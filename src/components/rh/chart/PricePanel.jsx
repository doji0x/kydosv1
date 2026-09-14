import React from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import CandleShape from "@/components/rh/chart/CandleShape";
import CandleTooltip from "@/components/rh/chart/CandleTooltip";

export default function PricePanel({ rows, active, height = 220 }) {
  const lows = rows.map((r) => r.low);
  const highs = rows.map((r) => r.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const pad = (max - min || max * 0.01 || 1) * 0.08;
  const formingIndex = rows.length - 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis
            hide
            domain={[min - pad, max + pad]}
            allowDataOverflow
          />
          {/* `active` is reserved by recharts on tooltip content, so indicators pass under their own name. */}
          <Tooltip content={<CandleTooltip indicators={active} />} cursor={{ stroke: "hsl(var(--border))" }} />

          {active.bb && (
            <>
              <Line dataKey="bbUpper" stroke="hsl(var(--chart-4))" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls />
              <Line dataKey="bbMiddle" stroke="hsl(var(--chart-4))" strokeWidth={1} strokeOpacity={0.5} dot={false} isAnimationActive={false} connectNulls />
              <Line dataKey="bbLower" stroke="hsl(var(--chart-4))" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls />
            </>
          )}

          <Bar dataKey="hl" isAnimationActive={false} shape={<CandleShape formingIndex={formingIndex} />} />

          {active.ema && (
            <>
              <Line dataKey="ema9" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
              <Line dataKey="ema21" stroke="hsl(var(--chart-5))" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
              <Line dataKey="ema50" stroke="hsl(var(--chart-4))" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            </>
          )}
          {active.vwap && (
            <Line dataKey="vwap" stroke="hsl(var(--foreground))" strokeWidth={1.25} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}