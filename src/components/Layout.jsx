import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Plus, Wallet } from "lucide-react";
import { getWallet, shortAddr } from "@/lib/wallet";

export const LOGO_URL =
  "https://media.base44.com/images/public/user_68d48936484cae0abf1251aa/b42f7670f_2769dbae-4763-4263-bd14-b66b2accddf4.png";

export default function Layout() {
  const wallet = getWallet();
  const navCls = ({ isActive }) =>
    `text-sm tracking-wide transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <img src={LOGO_URL} alt="Kydos" className="h-9 w-9 rounded-full ring-1 ring-primary/30 group-hover:ring-primary/70 transition" />
            <span className="font-display font-semibold text-lg tracking-[0.18em] gold-text">KYDOS</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-8">
            <NavLink to="/" end className={navCls}>Board</NavLink>
            <NavLink to="/launch" className={navCls}>Launch</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/launch" className="sm:hidden inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary text-primary-foreground">
              <Plus className="h-4 w-4" />
            </Link>
            <div className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-full border border-border bg-card text-xs font-mono text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              {shortAddr(wallet)}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground font-mono">
        Kydos · Robinhood Chain · simulated curve preview
      </footer>
    </div>
  );
}