import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMe } from "@/lib/MeContext";
import { fetchNotifications, getSeenAt } from "@/lib/notifications";

// Live count of notifications newer than the last time the user opened the tab.
export function useUnreadCount() {
  const { me } = useMe();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!me) return setUnread(0);
    const load = () =>
      fetchNotifications(me).then((items) => {
        const seen = getSeenAt();
        setUnread(pathname === "/notifications" ? 0 : items.filter((n) => new Date(n.created_date).getTime() > seen).length);
      });
    load();
    const unsubs = [base44.entities.PostLike.subscribe(load), base44.entities.Post.subscribe(load), base44.entities.Follow.subscribe(load)];
    return () => unsubs.forEach((u) => u());
  }, [me, pathname]);

  return unread;
}