import React from "react";

export default function AuditEventCard({ event }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-primary">{event.severity} · {event.scope}</span>
        <span className="text-xs text-muted-foreground">{new Date(event.audited_at).toLocaleString()}</span>
      </div>
      <p className="text-sm font-medium">{event.anomaly_reason}</p>
      <p className="font-mono text-[11px] text-muted-foreground break-all">{event.target}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-2 py-1">{event.status}</span>
        <span className="rounded-full bg-muted px-2 py-1">{event.verification_method}</span>
        {event.recommended_action && <span className="rounded-full bg-muted px-2 py-1">{event.recommended_action}</span>}
      </div>
      {event.model_reason && <p className="text-xs text-muted-foreground">{event.model_reason}</p>}
      <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div><dt>Confidence</dt><dd className="text-foreground">{event.model_confidence == null ? "—" : `${Math.round(event.model_confidence * 100)}%`}</dd></div>
        <div><dt>Repair source</dt><dd className="text-foreground">{event.repair_source || "—"}</dd></div>
      </dl>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Provenance values</summary><pre className="mt-2 overflow-auto rounded-xl bg-muted p-3 font-mono">{JSON.stringify({ original: event.original_value, corrected: event.corrected_value }, null, 2)}</pre></details>
    </article>
  );
}