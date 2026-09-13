import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtHood } from "@/lib/curve";
import { cashOf } from "@/lib/balance";
import { buildPortfolio } from "@/lib/portfolio";

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

  if (!p || profile === undefined) return <Skeleton className="h-20 m-4 rounded-xl" />;

  const cash = cashOf(profile);

  return (
    <div className="px-4 py-6 font-mono">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</p>
      <p className="text-3xl mt-1">
        {fmtHood(cash + p.value)}<span className="text-sm text-muted-foreground ml-1.5">HOOD</span>
      </p>
      <div className="mt-4 text-xs space-y-1.5">
        <Row label="Cash" value={fmtHood(cash)} />
        <Row label="Holdings" value={fmtHood(p.value)} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}