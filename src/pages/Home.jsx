import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";
import TokenCard from "@/components/tokens/TokenCard";
import { progress } from "@/lib/curve";

const TABS = [
  { key: "new", label: "New" },
  { key: "trending", label: "Trending" },
  { key: "graduating", label: "Near graduation" },
];

export default function Home() {
  const [tokens, setTokens] = useState(null);
  const [tab, setTab] = useState("new");

  const load = async () => setTokens(await base44.entities.Token.list("-created_date", 100));

  useEffect(() => {
    load();
    const unsub = base44.entities.Token.subscribe(() => load());
    return unsub;
  }, []);

  const sorted = tokens
    ? [...tokens].sort((a, b) => {
        if (tab === "trending") return (b.trade_count || 0) - (a.trade_count || 0);
        if (tab === "graduating") return progress(b) - progress(a);
        return new Date(b.created_date) - new Date(a.created_date);
      })
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-20">
      <section className="relative overflow-hidden rounded-3xl border border-border mt-6 mb-10 grid-lines">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <div className="relative px-6 sm:px-12 py-12 sm:py-16 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-8">
          <div className="max-w-xl">
            <p className="font-mono text-xs tracking-[0.3em] text-primary mb-4">ROBINHOOD CHAIN · EVM</p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold leading-[1.05]">
              Launch a token in seconds.<br />
              <span className="gold-text">Graduate to the arena.</span>
            </h1>
            <p className="mt-4 text-muted-foreground max-w-md">
              Fixed supply, fair bonding curve, liquidity locked on graduation. No presale, no team allocation.
            </p>
          </div>
          <Button asChild size="lg" className="rounded-full font-semibold px-7 gold-glow">
            <Link to="/launch"><Sparkles className="h-4 w-4 mr-2" /> Launch a token</Link>
          </Button>
        </div>
      </section>

      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-3 text-sm transition-colors ${tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {tab === t.key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </div>

      {!sorted ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="text-muted-foreground">No tokens yet. Be the first to launch on Kydos.</p>
          <Button asChild variant="outline" className="mt-4 rounded-full"><Link to="/launch">Launch a token</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((t, i) => <TokenCard key={t.id} token={t} index={i} />)}
        </div>
      )}
    </div>
  );
}