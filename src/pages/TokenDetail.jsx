import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import TokenHeader from "@/components/token/TokenHeader";
import PriceChart from "@/components/token/PriceChart";
import TradePanel from "@/components/token/TradePanel";
import CurveProgress from "@/components/token/CurveProgress";
import TradeFeed from "@/components/token/TradeFeed";

export default function TokenDetail() {
  const { id } = useParams();
  const [token, setToken] = useState(null);
  const [trades, setTrades] = useState([]);
  const [missing, setMissing] = useState(false);

  const load = async () => {
    const [t, tr] = await Promise.all([
      base44.entities.Token.get(id).catch(() => null),
      base44.entities.Trade.filter({ token_id: id }, "-created_date", 200),
    ]);
    if (!t) return setMissing(true);
    setToken(t);
    setTrades(tr);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.Trade.subscribe((e) => { if (e.data?.token_id === id) load(); });
    return unsub;
  }, [id]);

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-muted-foreground">Token not found.</p>
        <Link to="/" className="text-primary text-sm mt-3 inline-block">Back to board</Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 pb-20">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Board
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6 min-w-0">
          <TokenHeader token={token} />
          <PriceChart token={token} trades={trades} />
          <TradeFeed trades={trades} />
        </div>
        <div className="space-y-6">
          <TradePanel token={token} onTraded={load} />
          <CurveProgress token={token} />
        </div>
      </div>
    </div>
  );
}