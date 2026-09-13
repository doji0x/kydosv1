import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Image } from "@/components/ui/image";
import { marketCap, progress, fmtHood } from "@/lib/curve";
import { shortAddr } from "@/lib/wallet";

export default function TokenCard({ token, index = 0 }) {
  const pct = progress(token);
  const cap = marketCap(token);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.03 }}
    >
      <Link
        to={`/token/${token.id}`}
        className="group block rounded-2xl border border-border bg-card/70 p-4 hover:border-primary/50 hover:bg-card transition-all duration-300 hover:-translate-y-0.5"
      >
        <div className="flex gap-4">
          <div className="h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-muted ring-1 ring-border">
            {token.image_url ? (
              <Image src={token.image_url} alt={token.name} className="h-full w-full" />
            ) : (
              <div className="h-full w-full flex items-center justify-center font-display font-bold text-2xl gold-text">
                {token.ticker?.[0]}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="font-display font-semibold truncate">{token.name}</h3>
              <span className="font-mono text-xs text-primary shrink-0">${token.ticker}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">by {shortAddr(token.creator)}</p>
            <p className="text-sm text-muted-foreground/90 mt-2 line-clamp-2 leading-snug">{token.description}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs font-mono">
          <span className="text-muted-foreground">MC <span className="text-foreground">{fmtHood(cap)} HOOD</span></span>
          {token.status === "graduated" ? (
            <span className="text-emerald-400">Graduated</span>
          ) : (
            <span className="text-primary">{pct.toFixed(1)}%</span>
          )}
        </div>
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-600 via-primary to-yellow-200 transition-all duration-500"
            style={{ width: `${token.status === "graduated" ? 100 : pct}%` }}
          />
        </div>
      </Link>
    </motion.div>
  );
}