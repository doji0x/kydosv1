import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Bell, Github, UserRound } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { useMe } from "@/lib/MeContext";

export default function TopBar() {
  const { pathname } = useLocation(), { me } = useMe();
  const marketPage = pathname === '/' || pathname.startsWith('/markets/solana/');
  return <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
    <div className={`mx-auto flex items-center justify-between gap-5 px-4 ${marketPage ? 'h-16 max-w-7xl sm:px-6' : 'h-14 max-w-2xl'}`}>
      <div className="flex items-center gap-10"><Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Kydos home"><img src={LOGO_URL} alt="" className="h-8 w-8 rounded-full ring-1 ring-primary/30"/><span className="font-display font-semibold tracking-[0.18em] gold-text">KYDOS</span></Link>
        {marketPage && <nav aria-label="Main navigation" className="hidden items-center gap-7 text-xs lg:flex"><NavLink to="/" end className="font-medium text-primary">Discover</NavLink><Link to="/forum" className="text-muted-foreground hover:text-foreground">Community</Link><Link to="/launch" className="text-muted-foreground hover:text-foreground">Launch</Link></nav>}
      </div><div className="flex items-center gap-2">
        {marketPage && <><Link to="/notifications" aria-label="Notifications" className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:flex"><Bell className="h-4 w-4"/></Link><Link to={me ? '/profile' : '/login'} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs hover:border-primary/40"><UserRound className="h-3.5 w-3.5"/>{me ? 'Profile' : 'Sign in'}</Link></>}
        <Link to="/releases" aria-label="Deployments" className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"><Github className="h-4 w-4"/></Link>
      </div>
    </div>
  </header>;
}
