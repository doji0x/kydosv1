import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe } from "@/lib/MeContext";
import { fetchNotifications, getSeenAt } from "@/lib/notifications";

export default function NotificationBell() {
  const { me } = useMe();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!me) return;
    const load = () =>
      fetchNotifications(me).then((items) => {
        const seen = getSeenAt();
        setUnread(pathname === "/notifications" ? 0 : items.filter((n) => new Date(n.created_date).getTime() > seen).length);
      });
    load();
    const unsubs = [base44.entities.PostLike.subscribe(load), base44.entities.Post.subscribe(load), base44.entities.Follow.subscribe(load)];
    return () => unsubs.forEach((u) => u());
  }, [me, pathname]);

  if (!me) return null;

  return (
    <Link to="/notifications" aria-label="Notifications" className="relative h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition">
      <Bell className="h-[19px] w-[19px]" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-mono font-semibold flex items-center justify-center">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}