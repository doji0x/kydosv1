import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Image } from "@/components/ui/image";
import ProgressRing from "@/components/tokens/ProgressRing";
import { marketCap, progress, fmtHood } from "@/lib/curve";
import { shortAddr } from "@/lib/wallet";
import { timeAgo } from "@/lib/time";

export default function TokenCard({ token, index = 0 }) {
  const graduated = token.status === "graduated";
  const creator = token.creator_handle ? `@${token.creator_handle}` : shortAddr(token.creator);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      className="break-inside-avoid mb-4"
    >
      <Link to={`/token/${token.id}`} className="group block rounded-3xl overflow-hidden border border-border bg-card active:scale-[0.985] transition-transform">
        <div className="relative aspect-square bg-muted">
          {token.image_url ? (
            <Image src={token.image_url} alt={token.name} className="absolute inset-0 h-full w-full group-hover:scale-[1.03] transition-transform duration-500" />
          ) : (
            <div className="absolute inset-0 grid-lines flex items-center justify-center font-display font-bold text-7xl gold-text">{token.ticker?.[0]}</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
          <div className="absolute top-3 left-3 px-2.5 h-7 rounded-full bg-black/50 backdrop-blur text-[11px] font-mono text-white/80 flex items-center">{creator}</div>
          <div className="absolute top-3 right-3 rounded-full bg-black/50 backdrop-blur p-0.5">
            <ProgressRing pct={progress(token)} graduated={graduated} />
          </div>
          <div className="absolute bottom-0 inset-x-0 p-4">
            <div className="flex items-baseline gap-2">
              <h3 className="font-display font-bold text-xl text-white truncate">{token.name}</h3>
              <span className="font-mono text-sm text-primary shrink-0">${token.ticker}</span>
            </div>
            <p className="text-sm text-white/70 line-clamp-1 mt-0.5">{token.description}</p>
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between font-mono text-xs">
          <span className="text-muted-foreground">MC <span className="text-foreground font-semibold">{fmtHood(marketCap(token))}</span> HOOD</span>
          <span className="text-muted-foreground">{token.trade_count || 0} trades · {timeAgo(token.created_date)}</span>
        </div>
      </Link>
    </motion.div>
  );
}