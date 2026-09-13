import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import PostCard from "@/components/forum/PostCard";

export default function PostList({ posts, empty = "Nothing here yet." }) {
  if (!posts) {
    return <div className="p-4 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  }
  if (posts.length === 0) return <p className="py-16 text-center text-sm text-muted-foreground">{empty}</p>;
  return <div className="divide-y divide-border">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>;
}