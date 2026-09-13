import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X } from "lucide-react";
import TokenCard from "@/components/tokens/TokenCard";
import { progress } from "@/lib/curve";

const TABS = [
  { key: "new", label: "New" },
  { key: "trending", label: "Trending" },
  { key: "graduating", label: "Near graduation" },
];
const PAGE = 8;

export default function Home() {
  const [tokens, setTokens] = useState(null);
  const [tab, setTab] = useState("new");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef(null);

  useEffect(() => {
    const load = () => base44.entities.Token.list("-created_date", 200).then(setTokens);
    load();
    return base44.entities.Token.subscribe(load);
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE));
    io.observe(el);
    return () => io.disconnect();
  }, [tokens]);

  const needle = q.trim().toLowerCase();
  const list = tokens
    ? [...tokens]
        .filter((t) => !needle || t.name?.toLowerCase().includes(needle) || t.ticker?.toLowerCase().includes(needle))
        .sort((a, b) => {
          if (tab === "trending") return (b.trade_count || 0) - (a.trade_count || 0);
          if (tab === "graduating") return progress(b) - progress(a);
          return new Date(b.created_date) - new Date(a.created_date);
        })
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="sticky top-14 z-30 -mx-4 px-4 py-3 bg-background/80 backdrop-blur-xl flex items-center gap-2">
        {searching ? (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search tokens" className="h-10 pl-9 rounded-full bg-card" />
          </div>
        ) : (
          <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => { setTab(t.key); setLimit(PAGE); }}
                className={`h-10 px-4 rounded-full text-sm whitespace-nowrap transition-all ${tab === t.key ? "bg-primary text-primary-foreground font-semibold" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => { setSearching((s) => !s); setQ(""); }} className="h-10 w-10 shrink-0 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
          {searching ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </button>
      </div>

      {!list ? (
        <div className="columns-1 sm:columns-2 gap-4 mt-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 rounded-3xl mb-4 break-inside-avoid" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-24 text-center mt-2">
          <p className="text-muted-foreground">{needle ? "Nothing matches that search." : "No tokens yet."}</p>
          {!needle && <Link to="/launch" className="text-primary text-sm mt-2 inline-block">Launch the first one</Link>}
        </div>
      ) : (
        <>
          <div className="columns-1 sm:columns-2 gap-4 mt-2">
            {list.slice(0, limit).map((t, i) => <TokenCard key={t.id} token={t} index={i % PAGE} />)}
          </div>
          {limit < list.length && <div ref={sentinel} className="h-10" />}
        </>
      )}
    </div>
  );
}