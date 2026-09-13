import React from "react";
import { Link } from "react-router-dom";
import { fmtHood } from "@/lib/curve";

// X-style trends list: rank + subject line + volume, one tappable row each.
export default function TrendingList({ tokens }) {
  if (tokens.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Nothing trending yet.</p>;
  }
  return (
    <div>
      <h2 className="px-4 pt-4 pb-2 text-xl font-bold font-heading">Trending on Kydos</h2>
      <div className="divide-y divide-border/60">
        {tokens.map((t, i) => (
          <Link key={t.id} to={`/token/${t.id}`} className="block px-4 py-3 hover:bg-secondary/40 transition-colors">
            <p className="text-[11px] text-muted-foreground">{i + 1} · Trending</p>
            <p className="text-[15px] font-bold mt-0.5">${t.ticker}</p>
            <p className="text-[13px] text-muted-foreground truncate">{t.name}</p>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {t.trade_count || 0} trades · {fmtHood(t.market_cap || 0)} HOOD mcap
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}