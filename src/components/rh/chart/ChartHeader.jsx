import React from "react";
import ChartPills from "@/components/rh/chart/ChartPills";
import LiveBadge from "@/components/rh/chart/LiveBadge";
import { INTERVAL_KEYS } from "@/lib/rollCandles";
import { formatChartValue } from "@/components/rh/chart/chartScale";

export default function ChartHeader({ timeframe, setTimeframe, mode, setMode, canMarketCap, status, value }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <ChartPills options={INTERVAL_KEYS} isActive={(k) => k === timeframe} onSelect={setTimeframe} />
        <div role="group" aria-label="Chart value" className="flex gap-1.5">
          {[{ key: "price", label: "Price" }, { key: "mcap", label: "MCap" }].map(({ key, label }) => (
            <button key={key} type="button" aria-pressed={mode === key} disabled={key === "mcap" && !canMarketCap}
              title={key === "mcap" && !canMarketCap ? "Tracked market cap and price are needed" : label}
              onClick={() => setMode(key)}
              className={`h-7 px-2.5 text-[11px] rounded-full font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mode === key ? "bg-primary text-primary-foreground font-semibold" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <LiveBadge status={status} />
        {value > 0 && <span className="font-mono text-[11px] text-muted-foreground">{formatChartValue(value, mode)}{mode === "mcap" ? " MCap" : ""}</span>}
      </div>
    </div>
  );
}