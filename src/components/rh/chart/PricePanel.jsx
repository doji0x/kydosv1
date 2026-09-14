import React, { useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import CandleShape from "@/components/rh/chart/CandleShape";
import CandleTooltip from "@/components/rh/chart/CandleTooltip";
import { chartDomain, scaleChartRows, formatChartValue, TRILLION } from "@/components/rh/chart/chartScale";

export default function PricePanel({ rows, active, height = 250, forming = true, yZoom = 1, yShift = 0, timeframe = "5s", mode = "price", multiplier = 1, zoomDepth = 0 }) {
  const displayRows = useMemo(() => scaleChartRows(rows, multiplier), [rows, multiplier]);
  const formingIndex = forming ? rows.length - 1 : -1;
  const domain = chartDomain(displayRows, zoomDepth, yZoom, yShift);
  const ticks = zoomDepth > 0 ? Array.from({ length: 5 }, (_, i) => domain[0] + (domain[1] - domain[0]) * i / 4) : undefined;

  return (
    <div className="rounded-2xl border border-border bg-card p-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={displayRows} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="t" height={26} minTickGap={28} tickMargin={8}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            stroke="hsl(var(--border))" tickLine={false}
            tickFormatter={(t) => new Date(t).toLocaleString(undefined, timeframe === "1d" || timeframe === "1h"
              ? { month: "short", day: "numeric", ...(timeframe === "1h" ? { hour: "2-digit" } : {}) }
              : { hour: "2-digit", minute: "2-digit", ...(timeframe.endsWith("s") ? { second: "2-digit" } : {}), hour12: false })} />
          <YAxis orientation="right" width={82} tickCount={5} tickMargin={6}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            stroke="hsl(var(--border))" tickLine={false}
            tickFormatter={(value) => formatChartValue(value, mode)}
            ticks={ticks} domain={domain} allowDataOverflow />
          {zoomDepth === 1 && domain[1] === TRILLION && <ReferenceLine y={TRILLION} stroke="hsl(var(--primary))" strokeDasharray="4 4" />}
          {/* `active` is reserved by recharts on tooltip content, so indicators pass under their own name. */}
          <Tooltip content={<CandleTooltip indicators={active} mode={mode} />} cursor={{ stroke: "hsl(var(--border))" }} />

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