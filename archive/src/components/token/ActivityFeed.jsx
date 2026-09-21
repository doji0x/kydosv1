import React from "react";
import PostComposer from "@/components/forum/PostComposer";
import PostCard from "@/components/forum/PostCard";
import TradeRow from "@/components/token/TradeRow";

export default function ActivityFeed({ token, trades, posts }) {
  const items = [
    ...trades.map((t) => ({ kind: "trade", date: t.created_date, t })),
    ...posts.filter((p) => !p.reply_to).map((p) => ({ kind: "post", date: p.created_date, p })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <section className="rounded-3xl border border-border bg-card/60 overflow-hidden">
      <div className="px-4 h-12 flex items-center justify-between border-b border-border">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Activity</p>
        <p className="font-mono text-xs text-muted-foreground">{trades.length} trades · {posts.length} posts</p>
      </div>
      <PostComposer token={token} placeholder={`Say something about $${token.ticker}`} />
      {items.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">Quiet so far. Be first on the curve.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {items.map((i) => (i.kind === "trade" ? <TradeRow key={`t${i.t.id}`} trade={i.t} /> : <PostCard key={i.p.id} post={i.p} />))}
        </div>
      )}
    </section>
  );
}