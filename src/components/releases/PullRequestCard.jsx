import React from "react";
import { GitPullRequest, GitMerge, XCircle } from "lucide-react";

const STATES = {
  merged: { Icon: GitMerge, cls: "text-chart-5", label: "Merged" },
  open: { Icon: GitPullRequest, cls: "text-chart-2", label: "Open" },
  closed: { Icon: XCircle, cls: "text-destructive", label: "Closed" },
};

export default function PullRequestCard({ pr }) {
  const { Icon, cls, label } = STATES[pr.state] || STATES.open;
  const when = new Date(pr.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <a href={pr.url} target="_blank" rel="noreferrer"
      className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/50 transition">
      <div className="flex items-start gap-3">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cls}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{pr.title}</p>
          <p className="mt-1 text-[11px] font-mono text-muted-foreground truncate">
            #{pr.number} · {label} · {pr.author} · {when}
          </p>
          <p className="mt-1 text-[11px] font-mono text-muted-foreground truncate">
            {pr.branch} → {pr.base}
          </p>
          {pr.labels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pr.labels.map((l) => (
                <span key={l} className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-secondary-foreground">{l}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </a>
  );
}