import React from "react";

const COPY = {
  live: { text: "LIVE", tone: "text-chart-2", dot: "bg-chart-2" },
  connecting: { text: "CONNECTING", tone: "text-muted-foreground", dot: "bg-muted-foreground" },
  retrying: { text: "RECONNECTING", tone: "text-chart-3", dot: "bg-chart-3" },
};

export default function LiveBadge({ status }) {
  const s = COPY[status] || COPY.connecting;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider ${s.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${status === "live" ? "animate-pulse" : ""}`} />
      {s.text}
    </span>
  );
}