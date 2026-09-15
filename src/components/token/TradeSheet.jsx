import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import TradePanel from "@/components/token/TradePanel";
import { marketCap, fmtHood } from "@/lib/curve";

export default function TradeSheet({ token, onTraded }) {
  const [side, setSide] = useState(null);
  const graduated = token.status === "graduated";

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl px-4 h-20 flex items-center gap-3">
          <div className="flex-1 font-mono min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Market cap</p>
            <p className="font-semibold gold-text truncate">{fmtHood(marketCap(token))} ETH</p>
          </div>
          {graduated ? (
            <span className="text-xs font-mono px-3 h-9 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center">Graduated · trading on DEX</span>
          ) : (
            <>
              <Button onClick={() => setSide("buy")} className="h-12 px-8 rounded-full font-semibold gold-glow">Buy</Button>
              <Button variant="outline" onClick={() => setSide("sell")} className="h-12 px-6 rounded-full font-semibold">Sell</Button>
            </>
          )}
        </div>
      </div>

      <Drawer open={!!side} onOpenChange={(o) => !o && setSide(null)}>
        <DrawerContent className="bg-background border-border">
          <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-2">
            <DrawerTitle className="sr-only">Trade ${token.ticker}</DrawerTitle>
            {side && <TradePanel token={token} initialSide={side} onTraded={() => { setSide(null); onTraded?.(); }} />}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}