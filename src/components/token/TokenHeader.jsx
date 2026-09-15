import React from "react";
import { Link } from "react-router-dom";
import { Globe, Send } from "lucide-react";
import { Image } from "@/components/ui/image";
import { marketCap, currentPrice, fmtHood, fmtPrice } from "@/lib/curve";
import { shortAddr } from "@/lib/wallet";

export default function TokenHeader({ token }) {
  const links = [
    token.website && { href: token.website, icon: Globe, label: "Website" },
    token.twitter && { href: token.twitter, icon: null, label: "X" },
    token.telegram && { href: token.telegram, icon: Send, label: "Telegram" },
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-5 flex flex-col sm:flex-row gap-5">
      <div className="h-24 w-24 shrink-0 rounded-2xl overflow-hidden bg-muted ring-1 ring-border">
        {token.image_url ? (
          <Image src={token.image_url} alt={token.name} className="h-full w-full" />
        ) : (
          <div className="h-full w-full flex items-center justify-center font-display font-bold text-3xl gold-text">{token.ticker?.[0]}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl font-bold truncate">{token.name}</h1>
          <span className="font-mono text-primary">${token.ticker}</span>
          {token.status === "graduated" && <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Graduated</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1 font-mono">
          created by{" "}
          {token.creator_id ? (
            <Link to={`/profile/${token.creator_id}`} className="text-primary hover:underline">@{token.creator_handle || "anon"}</Link>
          ) : shortAddr(token.creator)}
        </p>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{token.description}</p>
        {links.length > 0 && (
          <div className="flex gap-3 mt-3">
            {links.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                {l.icon ? <l.icon className="h-3.5 w-3.5" /> : <span className="font-bold">𝕏</span>} {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:text-right shrink-0 font-mono">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Market cap</p>
          <p className="text-lg font-semibold gold-text">{fmtHood(marketCap(token))} ETH</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</p>
          <p className="text-sm">{fmtPrice(currentPrice(token))} ETH</p>
        </div>
      </div>
    </div>
  );
}