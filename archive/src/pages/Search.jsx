import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PostList from "@/components/forum/PostList";
import TrendingList from "@/components/search/TrendingList";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [tokens, setTokens] = useState(null);
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    const load = () => base44.entities.Token.list("-created_date", 200).then(setTokens);
    load();
    return base44.entities.Token.subscribe(load);
  }, []);

  useEffect(() => {
    const load = () => base44.entities.Post.list("-created_date", 300).then(setPosts);
    load();
    return base44.entities.Post.subscribe(load);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setParams(q ? { q } : {}, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [q, setParams]);

  const trending = useMemo(() => {
    if (!tokens || !posts) return [];
    const buzz = posts.reduce((acc, p) => {
      if (p.token_id) acc[p.token_id] = (acc[p.token_id] || 0) + 1;
      return acc;
    }, {});
    return [...tokens]
      .sort((a, b) => (b.trade_count || 0) * 2 + (buzz[b.id] || 0) * 3 - ((a.trade_count || 0) * 2 + (buzz[a.id] || 0) * 3))
      .slice(0, 8);
  }, [tokens, posts]);

  const term = q.trim().replace(/^\$/, "").toLowerCase();
  const tokenHits = !term || !tokens ? [] : tokens.filter((t) => `${t.name} ${t.ticker}`.toLowerCase().includes(term)).slice(0, 8);
  const postHits = !term || !posts ? [] : posts.filter((p) => `${p.body} ${p.author_handle || ""}`.toLowerCase().includes(term)).slice(0, 30);

  return (
    <div>
      <div className="sticky top-14 z-30 px-4 py-3 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tokens, posts, people"
            className="h-10 pl-9 pr-9 rounded-full bg-secondary border-transparent focus-visible:border-primary/50"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!tokens || !posts ? (
        <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : !term ? (
        <TrendingList tokens={trending} />
      ) : (
        <div>
          {tokenHits.length > 0 && (
            <div className="divide-y divide-border/60 border-b border-border">
              {tokenHits.map((t) => (
                <Link key={t.id} to={`/token/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40">
                  <span className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center font-mono text-xs text-primary">
                    {t.ticker?.slice(0, 3)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">${t.ticker}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <PostList posts={postHits} empty={tokenHits.length ? "No posts match." : "No results."} />
        </div>
      )}
    </div>
  );
}