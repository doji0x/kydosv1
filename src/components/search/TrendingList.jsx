import React from "react";
import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import { fmtHood } from "@/lib/curve";

export default function TrendingList({ tokens }) {
  if (tokens.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 text-primary" /> Trending
      </p>
      <div className="divide-y divide-border/60">
        {tokens.map((t, i) => (
          <Link key={t.id} to={`/token/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors">
            <span className="font-mono text-xs text-muted-foreground w-4">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">${t.ticker}</p>
              <p className="text-xs text-muted-foreground truncate">{t.name}</p>
            </div>
            <div className="text-right font-mono text-xs">
              <p>{fmtHood(t.market_cap || 0)} HOOD</p>
              <p className="text-muted-foreground">{t.trade_count || 0} trades</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}