import React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { fmtHood, fmtTokens } from "@/lib/curve";
import { shortAddr } from "@/lib/wallet";

export default function TradeFeed({ trades }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Trades</p>
      </div>
      {trades.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No trades yet. Be first on the curve.</p>
      ) : (
        <ul className="divide-y divide-border font-mono text-xs">
          {trades.slice(0, 30).map((t) => (
            <li key={t.id} className="grid grid-cols-[70px_1fr_1fr_1fr_70px] items-center gap-2 px-5 py-2.5">
              <span className={t.side === "buy" ? "text-emerald-400" : "text-red-400"}>{t.side.toUpperCase()}</span>
              <span className="text-muted-foreground truncate">{shortAddr(t.trader)}</span>
              <span className="text-right">{fmtHood(t.hood_amount)} HOOD</span>
              <span className="text-right text-muted-foreground">{fmtTokens(t.token_amount)}</span>
              <span className="text-right text-muted-foreground">{formatDistanceToNowStrict(new Date(t.created_date), { addSuffix: false })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}