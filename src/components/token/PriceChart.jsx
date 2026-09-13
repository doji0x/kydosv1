import React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { marketCap, fmtHood } from "@/lib/curve";

export default function PriceChart({ token, trades }) {
  const base = { time: new Date(token.created_date).getTime(), cap: 27.95 };
  const data = [base, ...[...trades].reverse().map((t) => ({ time: new Date(t.created_date).getTime(), cap: t.market_cap }))];
  if (data.length === 1) data.push({ time: Date.now(), cap: marketCap(token) });

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Market cap · HOOD</p>
        <p className="font-mono text-xs text-muted-foreground">{trades.length} trades</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(42 96% 56%)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(42 96% 56%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => format(v, "HH:mm")} stroke="hsl(0 0% 25%)" tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} />
            <YAxis dataKey="cap" domain={["auto", "auto"]} tickFormatter={fmtHood} stroke="hsl(0 0% 25%)" tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              contentStyle={{ background: "hsl(0 0% 8%)", border: "1px solid hsl(0 0% 16%)", borderRadius: 12, fontFamily: "var(--font-mono)", fontSize: 12 }}
              labelFormatter={(v) => format(v, "MMM d, HH:mm:ss")}
              formatter={(v) => [`${fmtHood(v)} HOOD`, "MC"]}
            />
            <Area type="monotone" dataKey="cap" stroke="hsl(42 96% 56%)" strokeWidth={2} fill="url(#gold)" isAnimationActive />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}