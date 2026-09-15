import React from "react";
import { progress, fmtHood, fmtTokens, GRADUATION_TARGET } from "@/lib/curve";

export default function CurveProgress({ token }) {
  const pct = token.status === "graduated" ? 100 : progress(token);
  const target = token.graduation_target || GRADUATION_TARGET;

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Bonding curve</p>
        <p className="font-mono text-sm text-primary">{pct.toFixed(1)}%</p>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-600 via-primary to-yellow-200 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        {token.status === "graduated"
          ? "Graduated. Native ETH and reserved tokens are permanently locked in a full-range Uniswap V4 position."
          : `${fmtHood(token.reserve || 0)} of ${target} ETH held. At ${target} ETH the curve closes and liquidity is permanently locked on Uniswap V4.`}
      </p>
      <div className="grid grid-cols-2 gap-3 mt-4 font-mono text-xs">
        <Stat label="In curve" value={`${fmtHood(token.reserve || 0)} ETH`} />
        <Stat label="Sold" value={fmtTokens(token.tokens_sold || 0)} />
        <Stat label="Trades" value={token.trade_count || 0} />
        <Stat label="Supply" value="1.00B" />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}