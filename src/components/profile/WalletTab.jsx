import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtHood } from "@/lib/curve";
import { cashOf } from "@/lib/balance";
import { buildPortfolio } from "@/lib/portfolio";
import PositionRow from "@/components/profile/PositionRow";

export default function WalletTab({ userId }) {
  const [profile, setProfile] = useState(undefined);
  const [trades, setTrades] = useState(null);
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    const load = () => base44.entities.Profile.filter({ user_id: userId }).then(([p]) => setProfile(p || null));
    load();
    return base44.entities.Profile.subscribe(load);
  }, [userId]);

  useEffect(() => {
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

  if (!p || profile === undefined) return <Skeleton className="h-28 m-4 rounded-xl" />;

  const cash = cashOf(profile);
  const total = cash + p.value;
  const up = p.pnl >= 0;

  return (
    <div className="px-4 py-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Total balance</p>
      <p className="font-mono text-3xl font-semibold mt-1">
        {fmtHood(total)} <span className="text-base text-muted-foreground font-normal">HOOD</span>
      </p>
      <p className={`font-mono text-xs mt-1 ${up ? "text-emerald-400" : "text-destructive"}`}>
        {up ? "+" : ""}{fmtHood(p.pnl)} ({up ? "+" : ""}{p.pct.toFixed(1)}%) all time
      </p>

      <div className="mt-4 font-mono text-xs space-y-2 border-t border-border/50 pt-3">
        <Row label="Cash" value={fmtHood(cash)} />
        <Row label="Holdings" value={fmtHood(p.value)} />
        <Row label="Realized PnL" value={`${p.realized >= 0 ? "+" : ""}${fmtHood(p.realized)}`} tone={p.realized >= 0} />
      </div>

      {p.open.length > 0 && (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Holdings · {p.open.length}</p>
          <div className="divide-y divide-border/50 border-t border-border/50">
            {p.open.map((pos) => <PositionRow key={pos.token_id} position={pos} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === undefined ? "" : tone ? "text-emerald-400" : "text-destructive"}>{value} HOOD</span>
    </div>
  );
}