import React from "react";
import { NavLink, Link } from "react-router-dom";
import { LayoutGrid, MessagesSquare, Search, Bell, Plus, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { useUnreadCount } from "@/hooks/useUnreadCount";

const LEFT = [
  { to: "/", icon: LayoutGrid, label: "Board", end: true },
  { to: "/forum", icon: MessagesSquare, label: "Forum" },
  { to: "/search", icon: Search, label: "Search" },
];

function Tab({ to, icon: Icon, label, end, badge }) {
  return (
    <NavLink to={to} end={end} className="relative flex flex-col items-center justify-center gap-1 h-full select-none">
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="tab-dot" className="absolute top-1.5 h-1 w-1 rounded-full bg-primary" />}
          <span className="relative">
            <Icon className={`h-[22px] w-[22px] transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`} strokeWidth={isActive ? 2.25 : 1.75} />
            {badge > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-mono font-semibold flex items-center justify-center">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </span>
          <span className={`text-[10px] tracking-wide ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function BottomTabBar() {
  const unread = useUnreadCount();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-lg grid grid-cols-6 h-16">
        {LEFT.map((t) => <Tab key={t.to} {...t} />)}
        <div className="relative flex items-start justify-center">
          <Link
            to="/launch"
            aria-label="Launch a token"
            className="absolute -top-5 h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center gold-glow active:scale-95 transition-transform"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </Link>
          <span className="absolute bottom-2 text-[10px] tracking-wide text-muted-foreground">Launch</span>
        </div>
        <Tab to="/notifications" icon={Bell} label="Alerts" badge={unread} />
        <Tab to="/profile" icon={UserRound} label="Profile" />
      </div>
    </nav>
  );
}