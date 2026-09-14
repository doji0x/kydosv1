// Pan/zoom viewport over a candle series.
//
// Keeps a window of `count` bars ending `offset` bars from the newest one, so the chart
// stays pinned to live while offset is 0 and holds still once the user drags back.
// Gestures are attached natively (not via React props) because pinch and horizontal
// wheel need preventDefault, which passive listeners cannot do.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MIN_BARS = 12;
const DEFAULT_BARS = 60;

export default function useChartViewport(rows) {
  const total = rows.length;
  const [count, setCount] = useState(DEFAULT_BARS);
  const [offset, setOffset] = useState(0);
  const ref = useRef(null);
  const gesture = useRef(null);

  const clampCount = useCallback(
    (n) => Math.max(MIN_BARS, Math.min(Math.round(n) || MIN_BARS, Math.max(total, MIN_BARS))),
    [total]
  );
  const clampOffset = useCallback(
    (o, c) => Math.max(0, Math.min(Math.round(o) || 0, Math.max(total - c, 0))),
    [total]
  );

  const applyCount = useCallback(
    (n) => {
      const next = clampCount(n);
      setCount(next);
      setOffset((o) => clampOffset(o, next));
    },
    [clampCount, clampOffset]
  );

  const zoomBy = useCallback((factor) => applyCount(count * factor), [applyCount, count]);
  const reset = useCallback(() => {
    setCount(DEFAULT_BARS);
    setOffset(0);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const barWidth = () => Math.max(el.clientWidth / Math.max(count, 1), 1);

    const onWheel = (e) => {
      e.preventDefault();
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setOffset((o) => clampOffset(o - e.deltaX / barWidth() * 4, count));
        return;
      }
      zoomBy(e.deltaY > 0 ? 1.2 : 1 / 1.2);
    };

    const onStart = (e) => {
      if (e.touches.length === 2) gesture.current = { mode: "pinch", spread: spread(e.touches), count };
      else if (e.touches.length === 1) gesture.current = { mode: "pan", x: e.touches[0].clientX, offset };
    };

    const onMove = (e) => {
      const g = gesture.current;
      if (!g) return;
      if (g.mode === "pinch" && e.touches.length === 2) {
        e.preventDefault();
        const now = spread(e.touches);
        if (now > 0 && g.spread > 0) applyCount(g.count * (g.spread / now));
      } else if (g.mode === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - g.x;
        if (Math.abs(dx) < 6) return;
        e.preventDefault();
        setOffset(clampOffset(g.offset + dx / barWidth(), count));
      }
    };

    const onEnd = () => {
      gesture.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [count, offset, applyCount, clampOffset, zoomBy]);

  const visible = useMemo(() => {
    if (!total) return rows;
    const end = total - Math.min(offset, Math.max(total - MIN_BARS, 0));
    return rows.slice(Math.max(end - count, 0), end);
  }, [rows, total, count, offset]);

  return {
    ref,
    rows: visible,
    live: offset === 0,
    canZoomOut: count < total,
    canZoomIn: count > MIN_BARS,
    zoomIn: () => zoomBy(1 / 1.4),
    zoomOut: () => zoomBy(1.4),
    reset,
  };
}