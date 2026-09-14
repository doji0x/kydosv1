// TradingView's lightweight-charts, fed by our own indexed candle series.
import React, { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";

const toSeries = (bars, multiplier) => {
  const out = [];
  let prev = 0;
  for (const b of bars) {
    const time = Math.floor(b.t / 1000);
    if (time <= prev) continue; // lightweight-charts requires strictly ascending time
    prev = time;
    out.push({
      time,
      open: b.open * multiplier,
      high: b.high * multiplier,
      low: b.low * multiplier,
      close: b.close * multiplier,
      volume: b.volume_usd || 0,
      up: b.close >= b.open,
    });
  }
  return out;
};

export default function TvChart({ bars, multiplier = 1, height = 420, onNeedHistory }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volRef = useRef(null);
  const framedRef = useRef(false);
  const historyRef = useRef(onNeedHistory);
  historyRef.current = onNeedHistory;

  // Create the chart once.
  useEffect(() => {
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#8a8578",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(250, 204, 21, 0.05)" },
        horzLines: { color: "rgba(250, 204, 21, 0.05)" },
      },
      rightPriceScale: { borderColor: "#212121", scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: {
        borderColor: "#212121",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 4,
        // Bars keep a readable width instead of collapsing into hairlines.
        barSpacing: 8,
        minBarSpacing: 2,
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "#6b6b6b", width: 1, style: 3, labelBackgroundColor: "#1a1a1a" },
        horzLine: { color: "#6b6b6b", width: 1, style: 3, labelBackgroundColor: "#1a1a1a" },
      },
      localization: {
        priceFormatter: (p) =>
          p >= 1000 ? `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${p.toPrecision(6)}`,
      },
    });

    candleRef.current = chart.addCandlestickSeries({
      upColor: "rgba(0,0,0,0)", // hollow bullish bodies
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision: 8, minMove: 1e-8 },
    });

    volRef.current = chart.addHistogramSeries({
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // Panning back past the loaded edge asks for more history.
    const onRange = (range) => {
      if (range && range.from < 6) historyRef.current?.();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chartRef.current = chart;

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Push data on every change.
  useEffect(() => {
    if (!candleRef.current || !bars?.length) return;
    const data = toSeries(bars, multiplier);
    candleRef.current.setData(data.map(({ up, volume, ...c }) => c));
    volRef.current.setData(
      data.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.up ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      }))
    );

    // Open on the recent action at full candle width rather than squeezing the whole history in.
    if (!framedRef.current && data.length) {
      framedRef.current = true;
      const span = Math.min(data.length, 160);
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: data.length - span,
        to: data.length + 4,
      });
    }
  }, [bars, multiplier]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" style={{ height }}>
      <div ref={boxRef} className="w-full h-full" />
    </div>
  );
}