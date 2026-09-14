import React from "react";
import { ZoomIn, ZoomOut, Crosshair } from "lucide-react";

const Btn = ({ onClick, disabled, label, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="h-7 w-7 grid place-items-center rounded-lg border border-border bg-secondary text-muted-foreground disabled:opacity-40 active:scale-95 transition"
  >
    {children}
  </button>
);

export default function ChartZoomControls({ view, barCount }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] text-muted-foreground mr-0.5">{barCount} bars</span>
      <Btn onClick={view.zoomOut} disabled={!view.canZoomOut} label="Zoom out">
        <ZoomOut className="w-3.5 h-3.5" />
      </Btn>
      <Btn onClick={view.zoomIn} disabled={!view.canZoomIn} label="Zoom in">
        <ZoomIn className="w-3.5 h-3.5" />
      </Btn>
      <Btn onClick={view.reset} disabled={view.live && !view.canZoomIn} label="Reset to live">
        <Crosshair className={`w-3.5 h-3.5 ${view.live ? "" : "text-primary"}`} />
      </Btn>
    </div>
  );
}