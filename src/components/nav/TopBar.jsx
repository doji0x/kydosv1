import React from "react";
import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { getWallet, shortAddr } from "@/lib/wallet";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={LOGO_URL} alt="Kydos" className="h-8 w-8 rounded-full ring-1 ring-primary/30" />
          <span className="font-display font-semibold tracking-[0.18em] gold-text">KYDOS</span>
        </Link>
        <div className="flex items-center gap-2 h-8 px-3 rounded-full border border-border bg-card text-[11px] font-mono text-muted-foreground">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          {shortAddr(getWallet())}
        </div>
      </div>
    </header>
  );
}