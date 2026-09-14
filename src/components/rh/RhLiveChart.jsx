import React, { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import ChartPills from "@/components/rh/chart/ChartPills";
import LiveBadge from "@/components/rh/chart/LiveBadge";
import PricePanel from "@/components/rh/chart/PricePanel";
import OscillatorPanels from "@/components/rh/chart/OscillatorPanels";
import ChartZoomControls from "@/components/rh/chart/ChartZoomControls";
import useLiveCandles from "@/hooks/useLiveCandles";
import useChartViewport from "@/hooks/useChartViewport";
import { INTERVAL_KEYS, isClientInterval } from "@/lib/rollCandles";
import { buildRows, INDICATORS } from "@/lib/indicators";
import { fmtUsdPrice } from "@/lib/format";

export default function RhLiveChart({ address }) {
  const [timeframe, setTimeframe] = useState("5s");
  const [active, setActive] = useState({ ema: true, bb: false, vwap: false, rsi: false, macd: false });
  const { candles, status, price } = useLiveCandles(address, timeframe);

  const rows = useMemo(() => (candles?.length ? buildRows(candles, active) : []), [candles, active]);
  const view = useChartViewport(rows);
  const toggle = (key) => setActive((a) => ({ ...a, [key]: !a[key] }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <ChartPills options={INTERVAL_KEYS} isActive={(k) => k === timeframe} onSelect={setTimeframe} />
        <div className="flex flex-col items-end shrink-0">
          <LiveBadge status={status} />
          {price ? <span className="font-mono text-[11px] text-muted-foreground">{fmtUsdPrice(price)}</span> : null}
        </div>
      </div>

      {!candles ? (
        <Skeleton className="h-[220px] rounded-2xl" />
      ) : rows.length === 0 ? (
        <RhAwaitingIndex
          label={
            isClientInterval(timeframe)
              ? "Waiting for the first live swap"
              : "No price history indexed yet at this interval"
          }
        />
      ) : (
        <>
          {/* Drag to pan, pinch or scroll to zoom — the y-axis rescales to what's in view. */}
          <div ref={view.ref} className="space-y-2 select-none" style={{ touchAction: "pan-y" }}>
            <PricePanel rows={view.rows} active={active} forming={view.live} />
            <OscillatorPanels rows={view.rows} active={active} />
          </div>
          <div className="flex items-center justify-end">
            <ChartZoomControls view={view} barCount={view.rows.length} />
          </div>
        </>
      )}

      <ChartPills options={INDICATORS} isActive={(k) => !!active[k]} onSelect={toggle} />
    </div>
  );
}