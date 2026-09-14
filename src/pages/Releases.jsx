import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { Github } from "lucide-react";
import ReleaseCard from "@/components/releases/ReleaseCard";

export default function Releases() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.functions
      .invoke("listGithubReleases", { limit: 30 })
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="flex items-center gap-2 mb-4">
        <Github className="h-5 w-5 text-primary" />
        <h1 className="font-display font-semibold tracking-wide">Deployments</h1>
        {data?.repo && <span className="text-[11px] font-mono text-muted-foreground">{data.repo}</span>}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-card p-6 text-sm text-muted-foreground">
          Couldn't load releases: {error}
        </div>
      ) : !data ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : data.releases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="text-muted-foreground text-sm">No deployments logged yet.</p>
          <p className="text-xs text-muted-foreground mt-1">A release is tagged each time Kydos is published.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.releases.map((r) => <ReleaseCard key={r.id} release={r} />)}
        </div>
      )}
    </div>
  );
}