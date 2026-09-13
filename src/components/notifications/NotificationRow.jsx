import React from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, AtSign, UserPlus } from "lucide-react";
import Avatar from "@/components/social/Avatar";
import { timeAgo } from "@/lib/time";

const META = {
  like: { icon: Heart, tone: "text-destructive", text: "liked your post" },
  reply: { icon: MessageCircle, tone: "text-primary", text: "replied to you" },
  mention: { icon: AtSign, tone: "text-primary", text: "mentioned you" },
  follow: { icon: UserPlus, tone: "text-emerald-400", text: "followed you" },
};

export default function NotificationRow({ n }) {
  const navigate = useNavigate();
  const { icon: Icon, tone, text } = META[n.type];
  const go = () => navigate(n.post_id ? `/post/${n.post_id}` : `/profile/${n.actor_id}`);

  return (
    <button onClick={go} className="w-full text-left flex gap-3 px-4 py-3.5 hover:bg-secondary/40 transition-colors">
      <Icon className={`h-4 w-4 mt-1 shrink-0 ${tone}`} />
      <Avatar src={n.avatar} handle={n.handle} className="h-8 w-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">@{n.handle}</span>{" "}
          <span className="text-muted-foreground">{text}</span>{" "}
          <span className="text-muted-foreground text-xs font-mono">· {timeAgo(n.created_date)}</span>
        </p>
        {n.preview && <p className="text-sm text-muted-foreground truncate mt-0.5">{n.preview}</p>}
      </div>
    </button>
  );
}