import React from "react";
import { Link } from "react-router-dom";
import { fmtHood, fmtTokens } from "@/lib/curve";

export default function PositionRow({ position }) {
  const up = position.unrealized >= 0;
  return (
    <Link to={`/token/${position.token_id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition">
      <div className="h-9 w-9 shrink-0 rounded-full bg-muted overflow-hidden flex items-center justify-center font-mono text-[10px] text-muted-foreground">
        {position.token?.image_url
          ? <img src={position.token.image_url} alt="" className="h-full w-full object-cover" />
          : (position.ticker || "?").slice(0, 3)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold truncate">${position.ticker}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{fmtTokens(position.qty)} held</p>
      </div>
      <div className="text-right font-mono">
        <p className="text-sm">{fmtHood(position.value)} <span className="text-muted-foreground text-[11px]">HOOD</span></p>
        <p className={`text-[11px] ${up ? "text-emerald-400" : "text-destructive"}`}>
          {up ? "+" : ""}{fmtHood(position.unrealized)} ({up ? "+" : ""}{position.pct.toFixed(1)}%)
        </p>
      </div>
    </Link>
  );
}