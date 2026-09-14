// Trading-chart viewport: pixels-per-bar zoom anchored at the cursor, drag/scroll to pan,
// and a price scale you grab directly — press and hold on the y-axis and drag up/down to move
// it, or scroll over the axis to stretch/compress it. Panning back past the loaded bars asks
// for older history. Native listeners are used so gestures can preventDefault.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AXIS_W, RIGHT_PAD_BARS, clamp } from "@/lib/chart/geometry";

const MIN_BAR_W = 2;
const MAX_BAR_W = 48;
const DEFAULT_BAR_W = 9;
const MIN_Y_ZOOM = 0.05;
const MAX_Y_ZOOM = 20;

export default function useChartViewport(rows, { onNeedHistory } = {}) {
  const total = rows.length;
  const [barW, setBarW] = useState(DEFAULT_BAR_W);
  const [shift, setShift] = useState(0); // bars scrolled back from live
  const [yZoom, setYZoom] = useState(1);
  const [yShift, setYShift] = useState(0);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [el, setEl] = useState(null); // callback ref: the wrapper mounts only once there are rows
  const st = useRef({});
  const plotW = Math.max(width - AXIS_W, 1);
  st.current = { barW, shift, total, plotW, yZoom, yShift };

  useEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const pan = useCallback((deltaBars) => {
    const s = st.current;
    setShift(clamp(s.shift + deltaBars, 0, Math.max(s.total - 1, 0)));
  }, []);

  // factor > 1 zooms out. `x` is the plot pixel to hold still.
  const zoomAt = useCallback((factor, x) => {
    const s = st.current;
    const nextW = clamp(s.barW / factor, MIN_BAR_W, MAX_BAR_W);
    if (nextW === s.barW) return;
    const anchor = x ?? s.plotW;
    const end = s.total - 1 + RIGHT_PAD_BARS - s.shift;
    const idx = end - (s.plotW - anchor) / s.barW;
    const nextEnd = idx + (s.plotW - anchor) / nextW;
    setBarW(nextW);
    setShift(clamp(s.total - 1 + RIGHT_PAD_BARS - nextEnd, 0, Math.max(s.total - 1, 0)));
  }, []);

  const zoomY = useCallback((factor) => setYZoom((z) => clamp(z * factor, MIN_Y_ZOOM, MAX_Y_ZOOM)), []);

  const reset = useCallback(() => {
    setBarW(DEFAULT_BAR_W);
    setShift(0);
    setYZoom(1);
    setYShift(0);
  }, []);

  useEffect(() => {
    if (!el) return;
    const local = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, h: r.height };
    };
    const onAxis = (x) => x >= st.current.plotW;
    const drag = { active: null };
    const pinch = { active: null };

    const onWheel = (e) => {
      e.preventDefault();
      const p = local(e);
      if (onAxis(p.x) || e.shiftKey) return zoomY(e.deltaY > 0 ? 1 / 1.15 : 1.15);
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return pan(-e.deltaX / st.current.barW);
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x);
    };
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      drag.active = null;
      setDragging(false);
      pinch.active = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) };
    };
    const onTouchMove = (e) => {
      if (!pinch.active || e.touches.length !== 2) return;
      e.preventDefault();
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const r = el.getBoundingClientRect();
      if (d > 0 && pinch.active.d > 0) zoomAt(pinch.active.d / d, (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left);
      pinch.active.d = d;
    };
    const endPinch = () => { pinch.active = null; };
    const onPointerDown = (e) => {
      if (pinch.active || e.button > 0) return;
      const p = local(e);
      drag.active = { x: e.clientX, y: e.clientY, h: p.h, axis: onAxis(p.x), shift: st.current.shift, yShift: st.current.yShift };
      setDragging(true);
    };
    const onPointerMove = (e) => {
      if (!drag.active || pinch.active) return;
      if (e.cancelable) e.preventDefault();
      const s = st.current;
      const d = drag.active;
      if (d.axis) {
        // One full drag across the chart height moves the price scale by one full span.
        setYShift(d.yShift + (e.clientY - d.y) / Math.max(d.h, 1));
        return;
      }
      setShift(clamp(d.shift + (e.clientX - d.x) / s.barW, 0, Math.max(s.total - 1, 0)));
    };
    const onPointerUp = () => { drag.active = null; setDragging(false); };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endPinch);
    el.addEventListener("touchcancel", endPinch);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endPinch);
      el.removeEventListener("touchcancel", endPinch);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [el, pan, zoomAt, zoomY]);

  const endIndex = total - 1 + RIGHT_PAD_BARS - shift;
  const maxIdx = Math.max(total - 1, 0);
  const first = clamp(Math.floor(endIndex - plotW / barW), 0, maxIdx);
  const last = clamp(Math.ceil(endIndex), 0, maxIdx);
  const visible = useMemo(() => rows.slice(first, last + 1), [rows, first, last]);

  // Reaching the oldest loaded bar pulls in more history.
  useEffect(() => {
    if (total && first <= 1) onNeedHistory?.();
  }, [first, total, onNeedHistory]);

  return {
    ref: setEl, width, rows: visible, first, last, endIndex, barW, yZoom, yShift, dragging,
    live: shift === 0,
    zoomed: barW !== DEFAULT_BAR_W || shift !== 0 || yZoom !== 1 || yShift !== 0,
    canZoomOut: barW > MIN_BAR_W,
    canZoomIn: barW < MAX_BAR_W,
    zoomIn: () => zoomAt(1 / 1.4),
    zoomOut: () => zoomAt(1.4),
    reset,
  };
}