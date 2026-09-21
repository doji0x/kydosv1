import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import TokenPostDialog from "@/components/token/TokenPostDialog";
import { Image } from "@/components/ui/image";
import ProgressRing from "@/components/tokens/ProgressRing";
import { marketCap, progress, fmtHood } from "@/lib/curve";
import { shortAddr } from "@/lib/wallet";
import { timeAgo } from "@/lib/time";

export default function TokenCard({ token, index = 0 }) {
  const [posting, setPosting] = useState(false);
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
        <div className="px-4 py-3 flex items-center gap-3 font-mono text-xs">
          <span className="text-muted-foreground">MC <span className="text-foreground font-semibold">{fmtHood(marketCap(token))}</span> ETH</span>
          <span className="text-muted-foreground ml-auto">{token.trade_count || 0} trades · {timeAgo(token.created_date)}</span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPosting(true); }}
            aria-label={`Post about $${token.ticker}`}
            className="h-8 w-8 -my-1 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        </div>
      </Link>
      <TokenPostDialog token={token} open={posting} onOpenChange={setPosting} />
    </motion.div>
  );
}