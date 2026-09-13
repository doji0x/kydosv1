import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
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

  if (!p) return <Skeleton className="h-40 mx-4 mt-6 rounded-2xl" />;

  const up = p.pnl >= 0;
  const Arrow = up ? TrendingUp : TrendingDown;

  return (
    <section className="mx-4 mt-6 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> Portfolio balance
        </p>
        <p className="font-mono text-3xl font-bold mt-1.5">
          {fmtHood(p.value)} <span className="text-base text-muted-foreground font-normal">HOOD</span>
        </p>
        <p className={`font-mono text-sm mt-1 flex items-center gap-1 ${up ? "text-emerald-400" : "text-destructive"}`}>
          <Arrow className="h-4 w-4" />
          {up ? "+" : ""}{fmtHood(p.pnl)} HOOD ({up ? "+" : ""}{p.pct.toFixed(1)}%) all time
        </p>

        <div className="grid grid-cols-3 gap-3 mt-4 font-mono text-xs">
          <Stat label="Invested" value={`${fmtHood(p.invested)}`} />
          <Stat label="Unrealized" value={`${p.unrealized >= 0 ? "+" : ""}${fmtHood(p.unrealized)}`} tone={p.unrealized >= 0} />
          <Stat label="Realized" value={`${p.realized >= 0 ? "+" : ""}${fmtHood(p.realized)}`} tone={p.realized >= 0} />
        </div>
      </div>

      <div className="border-t border-border px-5 py-3">
        {p.open.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">No open positions yet.</p>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Holdings · {p.open.length}</p>
            <div className="divide-y divide-border/60">
              {p.open.map((pos) => <PositionRow key={pos.token_id} position={pos} />)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl bg-muted/50 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm ${tone === undefined ? "" : tone ? "text-emerald-400" : "text-destructive"}`}>{value}</p>
    </div>
  );
}