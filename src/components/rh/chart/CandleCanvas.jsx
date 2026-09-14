import React, { useEffect, useMemo, useRef, useState } from "react";
import CandleTooltip from "@/components/rh/chart/CandleTooltip";
import { chartDomain, scaleChartRows } from "@/components/rh/chart/chartScale";
import { renderChart } from "@/lib/chart/drawChart";
import { clamp, makeScales } from "@/lib/chart/geometry";

export default function CandleCanvas({ view, rows, active, mode, multiplier, timeframe, height = 300 }) {
  const canvasRef = useRef(null);
  const [pointer, setPointer] = useState(null);
  const [axisHover, setAxisHover] = useState(false);
  const { width, first, last, endIndex, barW, yZoom, yShift, live } = view;

  const displayRows = useMemo(() => scaleChartRows(rows, multiplier), [rows, multiplier]);
  const domain = useMemo(
    () => chartDomain(displayRows.slice(first, last + 1), yZoom, yShift),
    [displayRows, first, last, yZoom, yShift]
  );
  const scales = makeScales({ width, height, endIndex, barW, domain });
  const hover = pointer && displayRows.length
    ? { index: clamp(scales.idxAt(pointer.x), first, last), y: pointer.y, x: pointer.x }
    : null;
  const hoverBar = hover ? displayRows[hover.index] : null;

  useEffect(() => {
    if (!canvasRef.current || !width) return;
    renderChart(canvasRef.current, {
      width, height, rows: displayRows, first, last, endIndex, barW, domain, active, mode, timeframe,
      formingIndex: live ? displayRows.length - 1 : -1, hover,
    });
  }, [width, height, displayRows, first, last, endIndex, barW, domain, active, mode, timeframe, live, hover?.index, hover?.y]);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    setAxisHover(x >= scales.plotW);
    setPointer(x < scales.plotW ? { x, y: e.clientY - r.top } : null);
  };

  return (
    <div className="relative rounded-2xl border border-border bg-card overflow-hidden" style={{ height }}>
      <canvas ref={canvasRef} className={`font-mono block ${axisHover ? "cursor-ns-resize" : ""}`}
        style={{ width: "100%", height }}
        onPointerMove={onMove} onPointerLeave={() => { setPointer(null); setAxisHover(false); }} />
      {hoverBar && !view.dragging && (
        <div className="absolute top-2 pointer-events-none" style={hover.x < scales.plotW / 2 ? { left: hover.x + 14 } : { right: width - hover.x + 14 }}>
          <CandleTooltip payload={[{ payload: hoverBar }]} indicators={active} mode={mode} />
        </div>
      )}
    </div>
  );
}