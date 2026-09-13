import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import PostList from "@/components/forum/PostList";
import { usePosts } from "@/hooks/usePosts";

const TABS = [["posts", "Posts"], ["replies", "Replies"], ["likes", "Likes"]];

export default function ProfileTabs({ userId }) {
  const [tab, setTab] = useState("posts");
  const [mine] = usePosts({ author_id: userId }, userId);
  const [liked, setLiked] = useState(null);

  useEffect(() => {
    if (tab !== "likes") return;
    const load = async () => {
      const likes = await base44.entities.PostLike.filter({ user_id: userId }, "-created_date", 30);
      const posts = await Promise.all(likes.map((l) => base44.entities.Post.get(l.post_id).catch(() => null)));
      setLiked(posts.filter(Boolean));
    };
    load();
    return base44.entities.PostLike.subscribe(load);
  }, [tab, userId]);

  const list = tab === "likes" ? liked : mine ? mine.filter((p) => (tab === "replies" ? !!p.reply_to : !p.reply_to)) : null;

  return (
    <div>
      <div className="flex border-b border-border">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`relative flex-1 h-12 text-sm transition-colors ${tab === k ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
            {tab === k && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-0.5 w-10 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
      <PostList posts={list} empty={tab === "likes" ? "No likes yet." : tab === "replies" ? "No replies yet." : "No posts yet."} />
    </div>
  );
}