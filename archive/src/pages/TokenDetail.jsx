import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import TokenHeader from "@/components/token/TokenHeader";
import PriceChart from "@/components/token/PriceChart";
import CurveProgress from "@/components/token/CurveProgress";
import ActivityFeed from "@/components/token/ActivityFeed";
import TradeSheet from "@/components/token/TradeSheet";
import useGoBack from "@/lib/useGoBack";
import WalletButton from "@/components/wallet/WalletButton";

export default function TokenDetail() {
  const { id } = useParams();
  const goBack = useGoBack("/");
  const [token, setToken] = useState(null);
  const [trades, setTrades] = useState([]);
  const [posts, setPosts] = useState([]);
  const [missing, setMissing] = useState(false);

  const load = async () => {
    const [t, tr, ps] = await Promise.all([
      base44.entities.Token.get(id).catch(() => null),
      base44.entities.Trade.filter({ token_id: id }, "-created_date", 200),
      base44.entities.Post.filter({ token_id: id }, "-created_date", 200),
    ]);
    if (!t) return setMissing(true);
    setToken(t); setTrades(tr); setPosts(ps);
  };

  useEffect(() => {
    load();
    const u1 = base44.entities.Trade.subscribe((e) => e.data?.token_id === id && load());
    const u2 = base44.entities.Post.subscribe((e) => e.data?.token_id === id && load());
    return () => { u1(); u2(); };
  }, [id]);

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied");
  };

  if (missing) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-muted-foreground">Token not found.</p>
        <Link to="/" className="text-primary text-sm mt-3 inline-block">Back to board</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-2 h-14 flex items-center gap-2">
          <button onClick={goBack} className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-card"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1 min-w-0 flex items-baseline gap-2">
            <span className="font-display font-semibold truncate">{token?.name}</span>
            {token && <span className="font-mono text-xs text-primary">${token.ticker}</span>}
          </div>
          <WalletButton />
          <button onClick={share} className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-card"><Share2 className="h-4.5 w-4.5" /></button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {!token ? (
          <><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-72 rounded-3xl" /><Skeleton className="h-40 rounded-3xl" /></>
        ) : (
          <>
            <TokenHeader token={token} />
            <PriceChart token={token} trades={trades} />
            <CurveProgress token={token} />
            <ActivityFeed token={token} trades={trades} posts={posts} />
          </>
        )}
      </div>

      {token && <TradeSheet token={token} onTraded={load} />}
    </div>
  );
}