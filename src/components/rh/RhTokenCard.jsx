import React from "react";
import { Link } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { fmtUsd, fmtUsdPrice, fmtPct, pctTone } from "@/lib/format";

export default function RhTokenCard({ token }) {
  return (
    <Link
      to={`/rh/${token.address}`}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card active:scale-[0.99] transition-transform"
    >
      {token.icon_url ? (
        <Image src={token.icon_url} alt={token.symbol} className="h-11 w-11 rounded-full shrink-0" />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded-full bg-muted grid-lines flex items-center justify-center font-display font-bold gold-text">
          {token.symbol?.[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display font-semibold truncate">{token.name || token.symbol}</span>
          <span className="font-mono text-xs text-primary shrink-0">${token.symbol}</span>
        </div>
        <p className="font-mono text-xs text-muted-foreground mt-0.5">
          MC {fmtUsd(token.market_cap)} · Vol {fmtUsd(token.volume_24h)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono text-sm">{fmtUsdPrice(token.price_usd)}</p>
        <p className={`font-mono text-xs ${pctTone(token.change_24h)}`}>{fmtPct(token.change_24h)}</p>
      </div>
    </Link>
  );
}