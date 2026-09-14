import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { Github } from "lucide-react";
import ReleaseCard from "@/components/releases/ReleaseCard";
import PullRequestList from "@/components/releases/PullRequestList";

const TABS = [
  { key: "pulls", label: "Pull requests" },
  { key: "deploys", label: "Deployments" },
];

export default function Releases() {
  const [tab, setTab] = useState("pulls");
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
      <div className="flex items-center gap-2 mb-3">
        <Github className="h-5 w-5 text-primary" />
        <h1 className="font-display font-semibold tracking-wide">Team dashboard</h1>
        {data?.repo && <span className="text-[11px] font-mono text-muted-foreground">{data.repo}</span>}
      </div>

      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`h-9 px-4 rounded-full text-sm transition-all ${tab === t.key ? "bg-primary text-primary-foreground font-semibold" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pulls" ? (
        <PullRequestList />
      ) : error ? (
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