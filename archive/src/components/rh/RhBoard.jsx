import React, { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import RhTokenCard from "@/components/rh/RhTokenCard";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import { fetchRhTrending } from "@/lib/rhApi";

export default function RhBoard() {
  const [tokens, setTokens] = useState(null);

  useEffect(() => {
    fetchRhTrending().then((d) => setTokens(d.tokens || []));
  }, []);

  if (!tokens) {
    return (
      <div className="space-y-3 mt-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[70px] rounded-2xl" />)}
      </div>
    );
  }

  if (tokens.length === 0) return <div className="mt-2"><RhAwaitingIndex label="No tracked chain tokens yet" /></div>;

  const indexed = tokens.some((t) => t.stats_updated_at);

  return (
    <div className="space-y-3 mt-2">
      {tokens.map((t) => <RhTokenCard key={t.address} token={t} />)}
      {!indexed && <RhAwaitingIndex label="Live prices pending — indexer not running" />}
    </div>
  );
}