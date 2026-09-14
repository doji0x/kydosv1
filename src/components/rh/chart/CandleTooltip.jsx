import React from "react";
import { formatChartValue } from "@/components/rh/chart/chartScale";

const Row = ({ label, value, tone = "text-foreground" }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className={tone}>{value}</span>
  </div>
);

export default function CandleTooltip({ payload, indicators, mode = "price" }) {
  const fmtUsdPrice = (value) => formatChartValue(value, mode);
  const bar = payload?.[0]?.payload;
  if (!bar) return null;
  const up = bar.close >= bar.open;

  return (
    <div className="rounded-xl border border-border bg-popover/95 backdrop-blur px-3 py-2 font-mono text-[11px] space-y-0.5">
      <p className="text-muted-foreground mb-1">{new Date(bar.t).toLocaleTimeString()} · {mode === "mcap" ? "Market cap" : "Price"}</p>
      <Row label="O" value={fmtUsdPrice(bar.open)} />
      <Row label="H" value={fmtUsdPrice(bar.high)} />
      <Row label="L" value={fmtUsdPrice(bar.low)} />
      <Row label="C" value={fmtUsdPrice(bar.close)} tone={up ? "text-chart-2" : "text-chart-3"} />
      {indicators?.ema && bar.ema9 != null && <Row label="EMA9" value={fmtUsdPrice(bar.ema9)} />}
      {indicators?.vwap && bar.vwap != null && <Row label="VWAP" value={fmtUsdPrice(bar.vwap)} />}
      {indicators?.rsi && bar.rsi != null && <Row label="RSI" value={bar.rsi.toFixed(1)} />}
      {bar.trades ? <Row label="Trades" value={bar.trades} /> : null}
    </div>
  );
}