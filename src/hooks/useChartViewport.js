// Trading-chart viewport: pixels-per-bar zoom anchored at the cursor, drag/scroll to pan,
// empty space when zoomed past the data, and — once everything fits — further zoom-out
// opens the price scale toward $1T (depth 0→1). Native listeners are used so gestures can
// preventDefault (React's are passive).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AXIS_W, RIGHT_PAD_BARS, clamp } from "@/lib/chart/geometry";

const MIN_BAR_W = 2;
const MAX_BAR_W = 48;
const DEFAULT_BAR_W = 9;
const MIN_Y_ZOOM = 0.25;
const MAX_Y_ZOOM = 8;
const DEPTH_STEP = 0.2;

export default function useChartViewport(rows) {
  const total = rows.length;
  const [barW, setBarW] = useState(DEFAULT_BAR_W);
  const [shift, setShift] = useState(0); // bars scrolled back from live
  const [depth, setDepth] = useState(0);
  const [yZoom, setYZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [el, setEl] = useState(null); // callback ref: the wrapper mounts only once there are rows
  const st = useRef({});
  const plotW = Math.max(width - AXIS_W, 1);
  st.current = { barW, shift, total, depth, plotW };

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
    const fitsAll = s.plotW / s.barW >= s.total + RIGHT_PAD_BARS || s.barW <= MIN_BAR_W;
    if (factor > 1 && fitsAll) return setDepth((d) => clamp(d + DEPTH_STEP, 0, 1));
    if (factor < 1 && s.depth > 0) return setDepth((d) => clamp(d - DEPTH_STEP, 0, 1));
    const nextW = clamp(s.barW / factor, MIN_BAR_W, MAX_BAR_W);
    if (nextW === s.barW) return;
    const anchor = x ?? s.plotW;
    const end = s.total - 1 + RIGHT_PAD_BARS - s.shift;
    const idx = end - (s.plotW - anchor) / s.barW;
    const nextEnd = idx + (s.plotW - anchor) / nextW;
    setBarW(nextW);
    setShift(clamp(s.total - 1 + RIGHT_PAD_BARS - nextEnd, 0, Math.max(s.total - 1, 0)));
  }, []);

  const reset = useCallback(() => {
    setBarW(DEFAULT_BAR_W);
    setShift(0);
    setDepth(0);
    setYZoom(1);
  }, []);

  useEffect(() => {
    if (!el) return;
    const localX = (clientX) => clientX - el.getBoundingClientRect().left;
    const drag = { active: null };
    const pinch = { active: null };

    const onWheel = (e) => {
      e.preventDefault();
      if (e.shiftKey) return setYZoom((z) => clamp(z * (e.deltaY > 0 ? 1 / 1.15 : 1.15), MIN_Y_ZOOM, MAX_Y_ZOOM));
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return pan(-e.deltaX / st.current.barW);
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, localX(e.clientX));
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
      if (d > 0 && pinch.active.d > 0) zoomAt(pinch.active.d / d, localX((e.touches[0].clientX + e.touches[1].clientX) / 2));
      pinch.active.d = d;
    };
    const endPinch = () => { pinch.active = null; };
    const onPointerDown = (e) => {
      if (pinch.active || e.button > 0) return;
      drag.active = { x: e.clientX, shift: st.current.shift };
      setDragging(true);
    };
    const onPointerMove = (e) => {
      if (!drag.active || pinch.active) return;
      if (e.cancelable) e.preventDefault();
      const s = st.current;
      setShift(clamp(drag.active.shift + (e.clientX - drag.active.x) / s.barW, 0, Math.max(s.total - 1, 0)));
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
  }, [el, pan, zoomAt]);

  const endIndex = total - 1 + RIGHT_PAD_BARS - shift;
  const maxIdx = Math.max(total - 1, 0);
  const first = clamp(Math.floor(endIndex - plotW / barW), 0, maxIdx);
  const last = clamp(Math.ceil(endIndex), 0, maxIdx);
  const visible = useMemo(() => rows.slice(first, last + 1), [rows, first, last]);

  return {
    ref: setEl, width, rows: visible, first, last, endIndex, barW, depth, yZoom, dragging,
    live: shift === 0,
    zoomed: barW !== DEFAULT_BAR_W || shift !== 0 || depth !== 0 || yZoom !== 1,
    canZoomOut: depth < 1,
    canZoomIn: barW < MAX_BAR_W || depth > 0,
    zoomIn: () => zoomAt(1 / 1.4),
    zoomOut: () => zoomAt(1.4),
    reset,
  };
}