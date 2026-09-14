import React, { useState } from "react";
import ChartHistoryLoader from "@/components/rh/chart/ChartHistoryLoader";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import ChartHeader from "@/components/rh/chart/ChartHeader";
import TvChart from "@/components/rh/chart/TvChart";
import useLiveCandles from "@/hooks/useLiveCandles";
import { isClientInterval } from "@/lib/rollCandles";

export default function RhLiveChart({ address, derivedSupply = 0 }) {
  const [mode, setMode] = useState("price");
  const canMarketCap = Number.isFinite(derivedSupply) && derivedSupply > 0;
  const displayMode = canMarketCap ? mode : "price";
  const multiplier = displayMode === "mcap" ? derivedSupply : 1;
  const [timeframe, setTimeframe] = useState("5s");
  const { candles, status, price, progress, loadOlder, loadingOlder, hasOlder } = useLiveCandles(address, timeframe);

  return (
    <div className="space-y-2">
      <ChartHeader timeframe={timeframe} setTimeframe={setTimeframe} mode={displayMode} setMode={setMode}
        canMarketCap={canMarketCap} status={status} value={price * multiplier} />

      {!candles ? (
        <ChartHistoryLoader progress={progress} capped={isClientInterval(timeframe)} />
      ) : candles.length === 0 ? (
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
          <TvChart bars={candles} multiplier={multiplier} onNeedHistory={loadOlder} />
          <span className="font-mono text-[10px] text-muted-foreground">
            {loadingOlder
              ? `Loading earlier history… ${progress?.trades ? `${progress.trades} swaps` : ""}`
              : hasOlder
                ? "Pan back to load more history"
                : "Start of available history"}
          </span>
        </>
      )}
    </div>
  );
}