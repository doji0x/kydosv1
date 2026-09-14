import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import useGoBack from "@/lib/useGoBack";
import { ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import PostCard from "@/components/forum/PostCard";
import PostComposer from "@/components/forum/PostComposer";
import PostList from "@/components/forum/PostList";
import { usePosts } from "@/hooks/usePosts";

export default function Thread() {
  const { id } = useParams();
  const goBack = useGoBack("/forum");
  const [post, setPost] = useState(undefined);
  const [replies] = usePosts({ reply_to: id }, id);

  useEffect(() => {
    const load = () => base44.entities.Post.get(id).then(setPost).catch(() => setPost(null));
    load();
    return base44.entities.Post.subscribe((e) => e.data?.id === id && load());
  }, [id]);

  return (
    <div className="mx-auto max-w-2xl border-x border-border/60 min-h-screen">
      <div className="sticky top-14 z-30 px-2 h-12 flex items-center gap-2 bg-background/80 backdrop-blur-xl border-b border-border/60">
        <button onClick={goBack} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-card"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="font-display font-semibold">Thread</h1>
      </div>
      {post === undefined && <Skeleton className="h-32 m-4 rounded-2xl" />}
      {post === null && (
        <div className="py-20 text-center text-sm text-muted-foreground">Post not found. <Link to="/forum" className="text-primary">Back to forum</Link></div>
      )}
      {post && (
        <>
          <div className="border-b border-border"><PostCard post={post} large /></div>
          <PostComposer replyTo={id} placeholder="Post your reply" />
          <PostList posts={replies} empty="No replies yet." />
        </>
      )}
    </div>
  );
}