import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AuditEventCard from "@/components/audit/AuditEventCard";

export default function MarketAudits() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    base44.functions.invoke("listRhAudits", { limit: 200 })
      .then((response) => setEvents(response.data.events || []))
      .catch((e) => setError(e.response?.data?.error || e.message));
  }, []);
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div><h1 className="font-display text-2xl font-bold">Market audits</h1><p className="text-sm text-muted-foreground">Astra’s provenance and deterministic repair trail.</p></div>
      {error && <p className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
      {events === null && !error && <p className="text-sm text-muted-foreground">Loading audits…</p>}
      {events?.length === 0 && <p className="text-sm text-muted-foreground">No anomalies have been recorded.</p>}
      {events?.map((event) => <AuditEventCard key={event.id} event={event} />)}
    </div>
  );
}