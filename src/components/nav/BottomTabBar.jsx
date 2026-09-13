import React from "react";
import { NavLink, Link } from "react-router-dom";
import { LayoutGrid, MessagesSquare, Plus, UserRound } from "lucide-react";
import { motion } from "framer-motion";

const LEFT = [
  { to: "/", icon: LayoutGrid, label: "Board", end: true },
  { to: "/forum", icon: MessagesSquare, label: "Forum" },
];
const RIGHT = [{ to: "/profile", icon: UserRound, label: "Profile" }];

function Tab({ to, icon: Icon, label, end }) {
  return (
    <NavLink to={to} end={end} className="relative flex flex-col items-center justify-center gap-1 h-full select-none">
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="tab-dot" className="absolute top-1.5 h-1 w-1 rounded-full bg-primary" />}
          <Icon className={`h-[22px] w-[22px] transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`} strokeWidth={isActive ? 2.25 : 1.75} />
          <span className={`text-[10px] tracking-wide ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-lg grid grid-cols-5 h-16">
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
        {RIGHT.map((t) => <Tab key={t.to} {...t} />)}
      </div>
    </nav>
  );
}