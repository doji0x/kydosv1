import React from "react";
import { fmtHood, fmtTokens } from "@/lib/curve";
import { shortAddr } from "@/lib/wallet";
import { timeAgo } from "@/lib/time";

export default function TradeRow({ trade }) {
  const buy = trade.side === "buy";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 font-mono text-xs">
      <span className={`h-2 w-2 rounded-full shrink-0 ${buy ? "bg-emerald-400" : "bg-red-400"}`} />
      <span className="text-muted-foreground truncate">{shortAddr(trade.trader)}</span>
      <span className={buy ? "text-emerald-400" : "text-red-400"}>{buy ? "bought" : "sold"}</span>
      <span>{fmtTokens(trade.token_amount)} ${trade.ticker}</span>
      <span className="text-muted-foreground">for {fmtHood(trade.hood_amount)} HOOD</span>
      <span className="ml-auto text-muted-foreground shrink-0">{timeAgo(trade.created_date)}</span>
    </div>
  );
}