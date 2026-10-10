import React, { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Bell, Github, UserRound } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { useMe } from "@/lib/MeContext";
import { useSolanaWallet } from "@/lib/SolanaWalletContext";

export default function TopBar() {
  const { pathname } = useLocation(), { me } = useMe();
  const wallet = useSolanaWallet();
  const [connecting, setConnecting] = useState(false), [walletError, setWalletError] = useState('');
  const connect = async () => {
    if (connecting || wallet.connected) return;
    setConnecting(true); setWalletError('');
    try { await wallet.connect(); } catch (error) { setWalletError(error.message); }
    finally { setConnecting(false); }
  };
  const marketPage = pathname === '/' || pathname.startsWith('/markets/solana/');
  return <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
    <div className={`mx-auto flex items-center justify-between gap-5 px-4 ${marketPage ? 'h-16 max-w-7xl sm:px-6' : 'h-14 max-w-2xl'}`}>
      <div className="flex items-center gap-10"><Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Kydos home"><img src={LOGO_URL} alt="" className="h-8 w-8 rounded-full ring-1 ring-primary/30"/><span className="font-display font-semibold tracking-[0.18em] gold-text">KYDOS</span></Link>
        {marketPage && <nav aria-label="Main navigation" className="hidden items-center gap-7 text-xs lg:flex"><NavLink to="/" end className="font-medium text-primary">Discover</NavLink><Link to="/forum" className="text-muted-foreground hover:text-foreground">Community</Link><Link to="/launch" className="text-muted-foreground hover:text-foreground">Launch</Link></nav>}
      </div><div className="flex items-center gap-2">
        {marketPage && <><Link to="/notifications" aria-label="Notifications" className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:flex"><Bell className="h-4 w-4"/></Link><Link to="/profile" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs hover:border-primary/40"><UserRound className="h-3.5 w-3.5"/>{me ? 'Profile' : 'Sign in'}</Link><button type="button" disabled={connecting || wallet.connected} onClick={connect} className="h-9 rounded-lg border border-primary/30 px-3 text-xs text-primary disabled:opacity-70">{wallet.connected ? 'Phantom connected' : connecting ? 'Connecting...' : 'Connect Phantom'}</button></>}
        <Link to="/releases" aria-label="Deployments" className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"><Github className="h-4 w-4"/></Link>
      </div>
    </div>
    {walletError && <p role="alert" className="mx-auto max-w-7xl px-4 pb-2 text-xs text-destructive">{walletError}</p>}
  </header>;
}