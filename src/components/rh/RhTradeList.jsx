import React, { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import { fetchRhTrades } from "@/lib/rhApi";
import { fmtUsd, fmtAmount } from "@/lib/format";
import { shortAddr } from "@/lib/wallet";
import { timeAgo } from "@/lib/time";

export default function RhTradeList({ address, symbol }) {
  const [trades, setTrades] = useState(null);

  useEffect(() => {
    fetchRhTrades(address).then((d) => setTrades(d.trades || []));
  }, [address]);

  if (!trades) return <Skeleton className="h-32 rounded-2xl" />;
  if (trades.length === 0) return <RhAwaitingIndex label="No swaps indexed yet" />;

  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      {trades.map((t) => (
        <div key={t.tx_hash + t.block_number} className="flex items-center gap-3 px-3 py-2.5 font-mono text-xs">
          <span className={t.side === "buy" ? "text-emerald-400" : "text-red-400"}>
            {t.side === "buy" ? "BUY" : "SELL"}
          </span>
          <span className="text-foreground">{fmtAmount(t.token_amount)} {symbol}</span>
          <span className="text-muted-foreground">{fmtUsd(t.volume_usd)}</span>
          <span className="ml-auto text-muted-foreground">{shortAddr(t.trader)}</span>
          <span className="text-muted-foreground/70">{timeAgo(t.block_time)}</span>
        </div>
      ))}
    </div>
  );
}