// Pan/zoom viewport over a candle series — trading-chart style.
//
// Horizontal: a window of `count` bars ending `offset` bars from the newest one, so the
// chart stays pinned to live while offset is 0 and holds still once dragged back.
// Vertical: `yZoom`/`yShift` adjust the auto price domain so the user can squeeze or
// slide the price axis instead of being locked to the visible high/low.
// Gestures use native pointer/wheel listeners because they need preventDefault, which
// React's passive listeners cannot do. Grab-drag works with a mouse and a finger alike.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MIN_BARS = 12;
const DEFAULT_BARS = 60;
const MIN_Y_ZOOM = 0.25;
const MAX_Y_ZOOM = 8;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));

export default function useChartViewport(rows) {
  const total = rows.length;
  const [count, setCount] = useState(DEFAULT_BARS);
  const [offset, setOffset] = useState(0);
  const [yZoom, setYZoom] = useState(1);
  const [yShift, setYShift] = useState(0);
  const [dragging, setDragging] = useState(false);
  const ref = useRef(null);
  const drag = useRef(null);
  const pinch = useRef(null);

  const clampCount = useCallback(
    (n) => clamp(Math.round(n) || MIN_BARS, MIN_BARS, Math.max(total, MIN_BARS)),
    [total]
  );
  const clampOffset = useCallback(
    (o, c) => clamp(Math.round(o) || 0, 0, Math.max(total - c, 0)),
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

  const zoomBy = useCallback((f) => applyCount(count * f), [applyCount, count]);
  const reset = useCallback(() => {
    setCount(DEFAULT_BARS);
    setOffset(0);
    setYZoom(1);
    setYShift(0);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const barWidth = () => Math.max(el.clientWidth / Math.max(count, 1), 1);
    const spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onWheel = (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        setYZoom((z) => clamp(z * (e.deltaY > 0 ? 1 / 1.15 : 1.15), MIN_Y_ZOOM, MAX_Y_ZOOM));
        return;
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setOffset((o) => clampOffset(o - (e.deltaX / barWidth()) * 4, count));
        return;
      }
      zoomBy(e.deltaY > 0 ? 1.2 : 1 / 1.2);
    };

    // Two-finger pinch: horizontal spread zooms time, vertical spread scales price.
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      drag.current = null;
      setDragging(false);
      pinch.current = {
        dx: Math.abs(e.touches[0].clientX - e.touches[1].clientX),
        dy: Math.abs(e.touches[0].clientY - e.touches[1].clientY),
        d: spread(e.touches),
        count,
        yZoom,
      };
    };

    const onTouchMove = (e) => {
      const p = pinch.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault();
      const dx = Math.abs(e.touches[0].clientX - e.touches[1].clientX);
      const dy = Math.abs(e.touches[0].clientY - e.touches[1].clientY);
      if (dy > dx && p.dy > 4) {
        setYZoom(clamp(p.yZoom * (dy / p.dy), MIN_Y_ZOOM, MAX_Y_ZOOM));
      } else if (p.d > 0) {
        const now = spread(e.touches);
        if (now > 0) applyCount(p.count * (p.d / now));
      }
    };

    const clearPinch = () => {
      if (!pinch.current) return;
      pinch.current = null;
    };

    const onPointerDown = (e) => {
      if (pinch.current || e.button > 0) return;
      drag.current = { x: e.clientX, y: e.clientY, offset, yShift, moved: false };
      setDragging(true);
    };

    const onPointerMove = (e) => {
      const d = drag.current;
      if (!d || pinch.current) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      d.moved = true;
      if (e.cancelable) e.preventDefault();
      setOffset(clampOffset(d.offset + dx / barWidth(), count));
      setYShift(clamp(d.yShift + dy / Math.max(el.clientHeight, 1), -3, 3));
    };

    const onPointerUp = () => {
      drag.current = null;
      setDragging(false);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", clearPinch, { passive: true });
    el.addEventListener("touchcancel", clearPinch, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", clearPinch);
      el.removeEventListener("touchcancel", clearPinch);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [count, offset, yZoom, yShift, applyCount, clampOffset, zoomBy]);

  const visible = useMemo(() => {
    if (!total) return rows;
    const end = total - Math.min(offset, Math.max(total - MIN_BARS, 0));
    return rows.slice(Math.max(end - count, 0), end);
  }, [rows, total, count, offset]);

  return {
    ref,
    rows: visible,
    dragging,
    yZoom,
    yShift,
    live: offset === 0,
    zoomed: count !== DEFAULT_BARS || yZoom !== 1 || yShift !== 0,
    canZoomOut: count < total,
    canZoomIn: count > MIN_BARS,
    zoomIn: () => zoomBy(1 / 1.4),
    zoomOut: () => zoomBy(1.4),
    reset,
  };
}