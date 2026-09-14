import React from "react";
import { fmtUsd, fmtPct, pctTone } from "@/lib/format";

const Cell = ({ label, value, tone = "" }) => (
  <div className="rounded-2xl border border-border bg-card px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`font-mono text-sm mt-0.5 ${tone}`}>{value}</p>
  </div>
);

export default function RhStatGrid({ token }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Cell label="Market cap" value={fmtUsd(token.market_cap)} />
      <Cell label="FDV" value={fmtUsd(token.fdv)} />
      <Cell label="Liquidity" value={fmtUsd(token.liquidity_usd)} />
      <Cell label="Vol 24h" value={fmtUsd(token.volume_24h)} />
      <Cell label="1h" value={fmtPct(token.change_1h)} tone={pctTone(token.change_1h)} />
      <Cell label="24h" value={fmtPct(token.change_24h)} tone={pctTone(token.change_24h)} />
      <Cell label="Holders" value={token.holder_count || "—"} />
      <Cell label="Trades 24h" value={token.trades_24h || "—"} />
      <Cell label="Pools" value={token.pool_count || "—"} />
    </div>
  );
}