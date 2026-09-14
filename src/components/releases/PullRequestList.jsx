import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import PullRequestCard from "./PullRequestCard";

export default function PullRequestList() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.functions
      .invoke("listGithubPullRequests", { limit: 30, state: "all" })
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <div className="rounded-2xl border border-destructive/40 bg-card p-6 text-sm text-muted-foreground">
        Couldn't load pull requests: {error}
      </div>
    );

  if (!data)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );

  if (data.pulls.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="text-muted-foreground text-sm">No pull requests yet.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      {data.pulls.map((pr) => <PullRequestCard key={pr.id} pr={pr} />)}
    </div>
  );
}