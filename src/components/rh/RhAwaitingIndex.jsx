import React from "react";
import { Radio } from "lucide-react";

// Honest state for tracked tokens whose stats haven't been indexed yet.
export default function RhAwaitingIndex({ label = "Awaiting first index" }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <Radio className="h-5 w-5 mx-auto text-muted-foreground" />
      <p className="text-sm text-muted-foreground mt-2">{label}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        The Kydos indexer needs an RPC provider key to read chain logs.
      </p>
    </div>
  );
}