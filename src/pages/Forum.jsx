import React from "react";
import PostComposer from "@/components/forum/PostComposer";
import PostList from "@/components/forum/PostList";
import { usePosts } from "@/hooks/usePosts";

export default function Forum() {
  const [posts] = usePosts({}, "all");
  const timeline = posts ? posts.filter((p) => !p.reply_to) : null;

  return (
    <div className="mx-auto max-w-2xl border-x border-border/60 min-h-screen">
      <div className="sticky top-14 z-30 px-4 h-12 flex items-center bg-background/80 backdrop-blur-xl border-b border-border/60">
        <h1 className="font-display font-semibold">Forum</h1>
      </div>
      <PostComposer />
      <PostList posts={timeline} empty="The forum is quiet. Start the first thread." />
    </div>
  );
}