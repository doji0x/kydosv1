import React, { useEffect, useState } from "react";
import WalletConnectPrompt from '@/components/profile/WalletConnectPrompt';
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/MeContext";
import { markSeen } from "@/lib/notifications";
import { useNotificationsFeed } from "@/hooks/useNotificationsFeed";
import NotificationRow from "@/components/notifications/NotificationRow";

const TABS = [["all", "All"], ["mentions", "Mentions"], ["likes", "Likes"]];

export default function Notifications() {
  const { me } = useMe();
  const items = useNotificationsFeed(me);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    if (me) markSeen();
  }, [me]);

  if (me === undefined) return <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  if (!me) return <WalletConnectPrompt title="Your notifications" description="Connect Phantom to see activity for your wallet profile." />;

  const list = !items ? null : items.filter((n) => (tab === "mentions" ? n.type === "mention" || n.type === "reply" : tab === "likes" ? n.type === "like" : true));

  return (
    <div>
      <div className="sticky top-14 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
      <h1 className="px-4 h-12 flex items-center text-xl font-bold font-heading">Notifications</h1>
      <div className="flex">
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