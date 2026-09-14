import React from "react";
import { ComposedChart, Line, Bar, Cell, YAxis, XAxis, ReferenceLine, ResponsiveContainer } from "recharts";

const Panel = ({ label, children }) => (
  <div className="rounded-2xl border border-border bg-card p-2 h-20">
    <p className="font-mono text-[10px] text-muted-foreground leading-none mb-1">{label}</p>
    <div className="h-[calc(100%-14px)]">
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  </div>
);

export default function OscillatorPanels({ rows, active }) {
  if (!active.rsi && !active.macd) return null;

  return (
    <div className="space-y-2">
      {active.rsi && (
        <Panel label="RSI 14">
          <ComposedChart data={rows} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={[0, 100]} />
            <ReferenceLine y={70} stroke="hsl(var(--chart-3))" strokeDasharray="2 2" strokeOpacity={0.6} />
            <ReferenceLine y={30} stroke="hsl(var(--chart-2))" strokeDasharray="2 2" strokeOpacity={0.6} />
            <Line dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </Panel>
      )}

      {active.macd && (
        <Panel label="MACD 12/26/9">
          <ComposedChart data={rows} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="macdHist" isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={i} fill={(r.macdHist || 0) >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-3))"} />
              ))}
            </Bar>
            <Line dataKey="macd" stroke="hsl(var(--primary))" strokeWidth={1.25} dot={false} isAnimationActive={false} connectNulls />
            <Line dataKey="macdSignal" stroke="hsl(var(--chart-5))" strokeWidth={1.25} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </Panel>
      )}
    </div>
  );
}