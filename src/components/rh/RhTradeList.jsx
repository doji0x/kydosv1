import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import useRhTrades from "@/hooks/useRhTrades";
import LiveBadge from "@/components/rh/chart/LiveBadge";
import { fmtUsd, fmtAmount } from "@/lib/format";
import { shortAddr } from "@/lib/wallet";
import { timeAgo } from "@/lib/time";

export default function RhTradeList({ address, symbol }) {
  const { trades, status, error } = useRhTrades(address);

  if (!trades) return <Skeleton className="h-32 rounded-2xl" />;
  if (trades.length === 0) return <div className="space-y-2"><LiveBadge status={status} /><RhAwaitingIndex label={error || "No swaps yet — new trades appear here live"} /></div>;

  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground"><span>Recent trades</span><LiveBadge status={status} /></div>
      {trades.map((t) => (
        <div key={`${t.tx_hash}-${t.log_index}`} className="flex flex-wrap items-center gap-2 px-3 py-2.5 font-mono text-xs">
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