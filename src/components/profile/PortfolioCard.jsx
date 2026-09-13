import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtHood } from "@/lib/curve";
import { buildPortfolio } from "@/lib/portfolio";
import PositionRow from "@/components/profile/PositionRow";

export default function PortfolioCard({ userId }) {
  const [trades, setTrades] = useState(null);
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    if (!userId) return;
    const load = () => base44.entities.Trade.filter({ trader_id: userId }, "-created_date", 500).then(setTrades);
    load();
    return base44.entities.Trade.subscribe(load);
  }, [userId]);

  useEffect(() => {
    const load = () => base44.entities.Token.list("-created_date", 200).then(setTokens);
    load();
    return base44.entities.Token.subscribe(load);
  }, []);

  const tokensById = useMemo(() => Object.fromEntries(tokens.map((t) => [t.id, t])), [tokens]);
  const p = useMemo(() => (trades ? buildPortfolio(trades, tokensById) : null), [trades, tokensById]);

  if (!p) return <Skeleton className="h-20 mx-4 mt-6 rounded-xl" />;

  const up = p.pnl >= 0;

  return (
    <section className="px-4 mt-6">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Portfolio</p>
      <div className="flex items-baseline gap-3 mt-1">
        <p className="font-mono text-2xl font-semibold">{fmtHood(p.value)}</p>
        <span className="font-mono text-xs text-muted-foreground">HOOD</span>
        <span className={`font-mono text-xs ml-auto ${up ? "text-emerald-400" : "text-destructive"}`}>
          {up ? "+" : ""}{fmtHood(p.pnl)} ({up ? "+" : ""}{p.pct.toFixed(1)}%)
        </span>
      </div>

      {p.open.length > 0 && (
        <div className="mt-2 divide-y divide-border/50 border-t border-border/50">
          {p.open.map((pos) => <PositionRow key={pos.token_id} position={pos} />)}
        </div>
      )}
    </section>
  );
}