import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

export default function AdminIndexerCallout({ isAdmin }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  if (!isAdmin) return null;
  const run = async () => {
    setRunning(true); setResult(null); setError("");
    try {
      const { data } = await base44.functions.invoke("runRhCycle", {});
      setResult(data);
    } catch (e) {
      const data = e.response?.data;
      if (data?.results) setResult(data);
      else setError(data?.error || e.message);
    } finally { setRunning(false); }
  };
  return <section className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
    <div className="flex items-start gap-3"><RefreshCw className="h-5 w-5 shrink-0 text-primary" /><div>
      <h2 className="text-sm font-semibold">Market-data indexer</h2>
      <p className="text-xs text-muted-foreground mt-1">GitHub Actions is the primary schedule. Run one cycle here as an admin backup.</p>
    </div></div>
    <Button type="button" size="sm" onClick={run} disabled={running}>{running && <Loader2 className="animate-spin" />}{running ? "Indexing…" : "Run indexing cycle now"}</Button>
    {running && <p role="status" className="text-xs text-muted-foreground">Reading the chain and refreshing market data. This can take several minutes.</p>}
    {error && <p role="alert" className="text-xs text-destructive break-words">{error}</p>}
    {result && <div aria-live="polite" className="space-y-2 font-mono text-xs">
      <p className={result.ok ? "text-chart-2" : "text-destructive"}>{result.ok ? "Cycle completed" : "Cycle finished with errors"} · {((result.total_ms || 0) / 1000).toFixed(1)}s</p>
      {(result.results || []).map((step, i) => <div key={`${step.step}-${i}`} className="rounded-lg bg-background p-2">
        <div className="flex flex-wrap justify-between gap-2"><span className="break-all">{step.step}</span><span className={step.ok ? "text-chart-2" : "text-destructive"}>{step.ok ? "OK" : "ERROR"} · {step.ms}ms</span></div>
        {step.error && <p className="mt-1 text-destructive break-words">{step.error}</p>}
      </div>)}
    </div>}
  </section>;
}