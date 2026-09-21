import React from "react";
import { History } from "lucide-react";

// Shown while the launch-to-now series is being assembled, so the wait is legible.
export default function ChartHistoryLoader({ progress, capped }) {
  const oldest = progress?.oldestTime ? new Date(progress.oldestTime) : null;
  return (
    <div className="h-[300px] rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-2 px-6 text-center">
      <History className="h-5 w-5 text-primary animate-pulse" />
      <p className="font-heading text-sm">
        {capped ? "Loading recent history" : "Loading full history from launch"}
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        {progress?.phase === "stored"
          ? "Reading indexed candles…"
          : `Scanned ${progress?.pages || 0} block windows · ${progress?.trades || 0} swaps`}
      </p>
      {oldest && (
        <p className="font-mono text-[10px] text-muted-foreground">
          back to {oldest.toLocaleString()}
        </p>
      )}
    </div>
  );
}