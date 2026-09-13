import React from "react";
import { Link } from "react-router-dom";
import { Wallet, Search } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { useMe } from "@/lib/MeContext";
import { cashOf } from "@/lib/balance";
import { fmtHood } from "@/lib/curve";
import NotificationBell from "@/components/nav/NotificationBell";

export default function TopBar() {
  const { me } = useMe();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl px-4 h-14 flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <img src={LOGO_URL} alt="Kydos" className="h-8 w-8 rounded-full ring-1 ring-primary/30" />
          <span className="font-display font-semibold tracking-[0.18em] gold-text hidden sm:inline">KYDOS</span>
        </Link>

        <Link
          to="/search"
          className="flex-1 min-w-0 flex items-center gap-2 h-8 px-3 rounded-full border border-border bg-secondary/60 text-[12px] text-muted-foreground hover:border-primary/40 transition"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="truncate">Search trending</span>
        </Link>

        <NotificationBell />

        {me && (
          <Link to="/profile" className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full border border-border bg-card text-[11px] font-mono text-muted-foreground hover:border-primary/50 hover:text-foreground transition">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            {fmtHood(cashOf(me.profile))}
          </Link>
        )}
      </div>
    </header>
  );
}