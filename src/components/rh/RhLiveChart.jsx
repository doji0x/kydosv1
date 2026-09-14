import React, { useMemo, useState } from "react";
import ChartHistoryLoader from "@/components/rh/chart/ChartHistoryLoader";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import ChartPills from "@/components/rh/chart/ChartPills";
import ChartHeader from "@/components/rh/chart/ChartHeader";
import CandleCanvas from "@/components/rh/chart/CandleCanvas";
import OscillatorPanels from "@/components/rh/chart/OscillatorPanels";
import ChartZoomControls from "@/components/rh/chart/ChartZoomControls";
import useLiveCandles from "@/hooks/useLiveCandles";
import useChartViewport from "@/hooks/useChartViewport";
import { isClientInterval } from "@/lib/rollCandles";
import { buildRows, INDICATORS } from "@/lib/indicators";

export default function RhLiveChart({ address, derivedSupply = 0 }) {
  const [mode, setMode] = useState("price");
  const canMarketCap = Number.isFinite(derivedSupply) && derivedSupply > 0;
  const displayMode = canMarketCap ? mode : "price";
  const multiplier = displayMode === "mcap" ? derivedSupply : 1;
  const [timeframe, setTimeframe] = useState("5s");
  const [active, setActive] = useState({ ema: true, bb: false, vwap: false, rsi: false, macd: false });
  const { candles, status, price, progress, loadOlder, loadingOlder, hasOlder } = useLiveCandles(address, timeframe);

  const rows = useMemo(() => (candles?.length ? buildRows(candles, active) : []), [candles, active]);
  const view = useChartViewport(rows, { onNeedHistory: loadOlder });
  const toggle = (key) => setActive((a) => ({ ...a, [key]: !a[key] }));

  return (
    <div className="space-y-2">
      <ChartHeader timeframe={timeframe} setTimeframe={setTimeframe} mode={displayMode} setMode={setMode}
        canMarketCap={canMarketCap} status={status} value={price * multiplier} />

      {!candles ? (
        <ChartHistoryLoader progress={progress} capped={isClientInterval(timeframe)} />
      ) : rows.length === 0 ? (
        <RhAwaitingIndex
          label={
            loadingOlder
              ? "Reading price history from the chain…"
              : isClientInterval(timeframe)
                ? "Waiting for the first live swap"
                : "No price history indexed yet at this interval"
          }
        />
      ) : (
        <>
          {/* Scroll/pinch to zoom around the cursor, drag to pan; keep zooming out to open the $1T scale. */}
          <div
            ref={view.ref}
            className={`space-y-2 select-none ${view.dragging ? "cursor-grabbing" : "cursor-crosshair"}`}
            style={{ touchAction: "none" }}
          >
            <CandleCanvas
              view={view}
              rows={rows}
              active={active}
              mode={displayMode}
              multiplier={multiplier}
              timeframe={timeframe}
            />
            <OscillatorPanels rows={view.rows} active={active} />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {loadingOlder
                ? `Loading earlier history… ${progress?.trades ? `${progress.trades} swaps` : ""}`
                : hasOlder
                  ? "Pan back to load more history"
                  : "Start of available history"}
            </span>
            <ChartZoomControls view={view} barCount={view.rows.length} />
          </div>
        </>
      )}

      <ChartPills options={INDICATORS} isActive={(k) => !!active[k]} onSelect={toggle} />
    </div>
  );
}