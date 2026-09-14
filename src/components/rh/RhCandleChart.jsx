import React, { useEffect, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import { fetchRhCandles } from "@/lib/rhApi";
import { fmtUsdPrice } from "@/lib/format";

const RANGES = ["5m", "1h", "1d"];

export default function RhCandleChart({ address }) {
  const [interval, setInterval] = useState("5m");
  const [candles, setCandles] = useState(null);

  useEffect(() => {
    setCandles(null);
    fetchRhCandles(address, interval).then((d) => setCandles(d.candles || []));
  }, [address, interval]);

  return (
    <div>
      <div className="flex gap-2 mb-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setInterval(r)}
            className={`h-8 px-3 rounded-full font-mono text-xs ${interval === r ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}
          >
            {r}
          </button>
        ))}
      </div>
      {!candles ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : candles.length === 0 ? (
        <RhAwaitingIndex label="No price history indexed yet" />
      ) : (
        <div className="h-48 rounded-2xl border border-border bg-card p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={candles}>
              <defs>
                <linearGradient id="rhFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                labelFormatter={(_, p) => (p?.[0] ? new Date(p[0].payload.t).toLocaleString() : "")}
                formatter={(v) => [fmtUsdPrice(v), "Close"]}
              />
              <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rhFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}