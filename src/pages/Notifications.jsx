import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/MeContext";
import { fetchNotifications, markSeen } from "@/lib/notifications";
import NotificationRow from "@/components/notifications/NotificationRow";

const TABS = [["all", "All"], ["mentions", "Mentions"], ["likes", "Likes"]];

export default function Notifications() {
  const { me } = useMe();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    if (!me) return;
    const load = () => fetchNotifications(me).then(setItems);
    load();
    markSeen();
    const unsubs = [
      base44.entities.PostLike.subscribe(load),
      base44.entities.Post.subscribe(load),
      base44.entities.Follow.subscribe(load),
    ];
    return () => unsubs.forEach((u) => u());
  }, [me]);

  if (me === undefined) return <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  if (!me) {
    return (
      <div className="py-20 text-center space-y-4">
        <Bell className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Sign in to see your notifications.</p>
        <Button onClick={() => base44.auth.redirectToLogin()}>Sign in</Button>
      </div>
    );
  }

  const list = !items ? null : items.filter((n) => (tab === "mentions" ? n.type === "mention" || n.type === "reply" : tab === "likes" ? n.type === "like" : true));

  return (
    <div>
      <div className="sticky top-14 z-30 flex border-b border-border bg-background/85 backdrop-blur-xl">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 h-11 text-sm relative ${tab === k ? "text-foreground font-semibold" : "text-muted-foreground"}`}
          >
            {label}
            {tab === k && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-10 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
      {!list ? (
        <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="divide-y divide-border/60">{list.map((n) => <NotificationRow key={n.id} n={n} />)}</div>
      )}
    </div>
  );
}