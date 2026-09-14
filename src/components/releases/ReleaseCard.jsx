import React from "react";
import { Tag, ExternalLink } from "lucide-react";

export default function ReleaseCard({ release }) {
  const when = release.published_at ? new Date(release.published_at) : null;
  return (
    <a
      href={release.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/50 transition"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-primary">
          <Tag className="h-3.5 w-3.5" />
          {release.tag}
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="mt-2 font-semibold text-sm">{release.name || release.tag}</p>
      {when && (
        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
          {when.toISOString().replace("T", " ").slice(0, 16)} UTC
        </p>
      )}
      {release.body && (
        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{release.body}</p>
      )}
    </a>
  );
}