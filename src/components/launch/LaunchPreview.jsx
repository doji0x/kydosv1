import React from "react";
import { Image } from "@/components/ui/image";
import { getWallet, shortAddr } from "@/lib/wallet";

export default function LaunchPreview({ form }) {
  return (
    <aside className="lg:sticky lg:top-24 self-start">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Preview</p>
      <div className="rounded-2xl border border-primary/30 bg-card p-4 gold-glow">
        <div className="flex gap-4">
          <div className="h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-muted ring-1 ring-border">
            {form.image_url ? (
              <Image src={form.image_url} alt="" className="h-full w-full" />
            ) : (
              <div className="h-full w-full flex items-center justify-center font-display font-bold text-2xl gold-text">
                {form.ticker?.[0] || "?"}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="font-display font-semibold truncate">{form.name || "Token name"}</h3>
              <span className="font-mono text-xs text-primary">${form.ticker || "TICK"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">by {shortAddr(getWallet())}</p>
            <p className="text-sm text-muted-foreground/90 mt-2 line-clamp-3">{form.description || "Your description will appear here."}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-between text-xs font-mono">
          <span className="text-muted-foreground">MC <span className="text-foreground">27.95 HOOD</span></span>
          <span className="text-primary">0.0%</span>
        </div>
        <div className="mt-2 h-1 rounded-full bg-muted" />
      </div>
    </aside>
  );
}