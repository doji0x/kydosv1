import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import useRhTrades from "@/hooks/useRhTrades";
import LiveBadge from "@/components/rh/chart/LiveBadge";
import { fmtUsd, fmtAmount } from "@/lib/format";
import { shortAddr } from "@/lib/wallet";
import { timeAgo } from "@/lib/time";

export default function RhTradeList({ address, symbol }) {
  const { trades, status, checkedAt, history } = useRhTrades(address);

  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground"><span>On-chain trades</span><LiveBadge status={status} /></div>
      {history.loading && !trades?.length && <Skeleton className="h-24" />}
      {!history.loading && !trades?.length && <p className="p-4 text-sm text-muted-foreground">No swaps in the scanned blocks. Load older trades or keep this tab open for new swaps.</p>}
      {(trades || []).map((t) => (
        <div key={`${t.tx_hash}-${t.log_index}`} className="flex flex-wrap items-center gap-2 px-3 py-2.5 font-mono text-xs">
          <span className={t.side === "buy" ? "text-emerald-400" : "text-red-400"}>
            {t.side === "buy" ? "BUY" : "SELL"}
          </span>
          <span className="text-foreground">{fmtAmount(t.token_amount)} {symbol}</span>
          <span className="text-muted-foreground">{t.price_usd > 0 ? fmtUsd(t.volume_usd) : "USD unavailable"}</span>
          <span className="ml-auto text-muted-foreground">{shortAddr(t.trader)}</span>
          <span className="text-muted-foreground/70">{timeAgo(t.block_time)}</span>
        </div>
      ))}
      <div className="space-y-2 px-3 py-3 text-xs text-muted-foreground">
        {history.error && <p role="alert" className="text-destructive">{history.error}</p>}
        <p>{history.scanned.toLocaleString()} historical blocks scanned{checkedAt ? ` · Checked ${new Date(checkedAt).toLocaleTimeString()}` : ""}</p>
        {history.hasMore && <Button variant="outline" size="sm" className="w-full" disabled={history.loading} onClick={history.loadMore}>
          {history.loading ? "Scanning pool history…" : history.error ? "Retry history" : "Load older trades"}
        </Button>}
      </div>
    </div>
  );
}