import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import Avatar from "@/components/social/Avatar";
import { isVideo } from "@/components/media/MediaUploadField";
import { useMe } from "@/lib/MeContext";
import { repost } from "@/lib/social";
import { timeAgo } from "@/lib/time";

function Action({ icon: Icon, count, active, onClick, activeCls }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className={`flex items-center gap-1.5 text-xs font-mono transition-colors hover:text-foreground ${active ? activeCls : "text-muted-foreground"}`}>
      <Icon className="h-4 w-4" fill={active ? "currentColor" : "none"} />{count || 0}
    </button>
  );
}

export default function PostCard({ post, large }) {
  const { me, likedIds, toggleLike } = useMe();
  const navigate = useNavigate();
  const liked = likedIds.has(post.id);
  const stop = (e) => e.stopPropagation();

  const doRepost = async () => {
    if (!me) return base44.auth.redirectToLogin();
    await repost(me, post);
    toast.success("Reposted");
  };

  return (
    <article onClick={() => !large && navigate(`/post/${post.id}`)} className={`flex gap-3 p-4 transition-colors ${large ? "" : "hover:bg-card/60 cursor-pointer"}`}>
      <Link to={`/profile/${post.author_id}`} onClick={stop}><Avatar src={post.author_avatar} handle={post.author_handle} /></Link>
      <div className="flex-1 min-w-0">
        {post.repost_of && <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1"><Repeat2 className="h-3 w-3" /> reposted</p>}
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <Link to={`/profile/${post.author_id}`} onClick={stop} className="font-semibold truncate hover:underline">@{post.author_handle || "anon"}</Link>
          <span className="text-muted-foreground shrink-0">· {timeAgo(post.created_date)}</span>
          {post.token_ticker && (
            <Link to={`/token/${post.token_id}`} onClick={stop} className="ml-auto shrink-0 px-2 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-mono flex items-center">${post.token_ticker}</Link>
          )}
        </div>
        <p className={`mt-1 whitespace-pre-wrap break-words leading-relaxed ${large ? "text-lg" : "text-[15px]"}`}>{post.body}</p>
        {post.image_url && (
          isVideo(post.image_url)
            ? <video src={post.image_url} controls onClick={stop} className="mt-3 rounded-2xl w-full aspect-video bg-black" />
            : <Image src={post.image_url} alt="" className="mt-3 rounded-2xl w-full aspect-video" />
        )}
        <div className="flex items-center gap-7 mt-3">
          <Action icon={MessageCircle} count={post.reply_count} onClick={() => navigate(`/post/${post.id}`)} />
          <Action icon={Repeat2} count={post.repost_count} onClick={doRepost} />
          <Action icon={Heart} count={post.like_count} active={liked} activeCls="text-primary" onClick={() => toggleLike(post)} />
        </div>
      </div>
    </article>
  );
}