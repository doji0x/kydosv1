import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import useGoBack from "@/lib/useGoBack";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Image } from "@/components/ui/image";
import RhStatGrid from "@/components/rh/RhStatGrid";
import RhLiveChart from "@/components/rh/RhLiveChart";
import RhTradeList from "@/components/rh/RhTradeList";
import RhHolderList from "@/components/rh/RhHolderList";
import { fetchRhToken } from "@/lib/rhApi";
import { fmtUsdPrice, fmtPct, pctTone } from "@/lib/format";
import { shortAddr } from "@/lib/wallet";

const TABS = ["Trades", "Holders"];

export default function RhTokenDetail() {
  const { address } = useParams();
  const goBack = useGoBack("/");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("Trades");
  const derivedSupply = useMemo(() => {
    const token = data?.token;
    const ratio = token?.price_usd > 0 ? token.market_cap / token.price_usd : 0;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  }, [data]);

  useEffect(() => {
    fetchRhToken(address)
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(e.message));
  }, [address]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 space-y-3 pt-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  const t = data.token;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 space-y-4">
      <div className="flex items-center gap-3 pt-3">
        <button onClick={goBack} className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {t.icon_url ? (
          <Image src={t.icon_url} alt={t.symbol} className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted grid-lines flex items-center justify-center font-display font-bold gold-text">
            {t.symbol?.[0]}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display font-bold text-lg truncate">{t.name || t.symbol}</h1>
            <span className="font-mono text-xs text-primary">${t.symbol}</span>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">{shortAddr(t.address)} · Robinhood Chain</p>
        </div>
      </div>

      <div>
        <p className="font-display text-3xl font-bold">{fmtUsdPrice(t.price_usd)}</p>
        <p className={`font-mono text-sm ${pctTone(t.change_24h)}`}>{fmtPct(t.change_24h)} 24h</p>
      </div>

      <RhLiveChart key={t.address} address={t.address} derivedSupply={derivedSupply} />
      <RhStatGrid token={t} />

      <div className="flex gap-2">
        {TABS.map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`h-9 px-4 rounded-full text-sm ${tab === x ? "bg-primary text-primary-foreground font-semibold" : "bg-card border border-border text-muted-foreground"}`}
          >
            {x}
          </button>
        ))}
      </div>
      {tab === "Trades" ? <RhTradeList address={t.address} symbol={t.symbol} /> : <RhHolderList address={t.address} />}
    </div>
  );
}