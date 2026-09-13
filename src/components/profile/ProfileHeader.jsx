import React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/social/Avatar";
import FollowButton from "@/components/profile/FollowButton";
import FollowStats from "@/components/profile/FollowStats";

export default function ProfileHeader({ profile, userId, isMe, onEdit }) {
  return (
    <div>
      <div className="h-28 grid-lines bg-gradient-to-br from-primary/20 via-card to-background" />
      <div className="px-4">
        <div className="flex items-end justify-between -mt-10">
          <Avatar src={profile?.avatar_url} handle={profile?.handle} className="h-20 w-20 text-2xl ring-4 ring-background" />
          {isMe ? (
            <Button variant="outline" onClick={onEdit} className="rounded-full h-9 px-4"><Pencil className="h-3.5 w-3.5 mr-2" /> Edit profile</Button>
          ) : (
            <FollowButton targetId={userId} />
          )}
        </div>
        <h1 className="font-display font-bold text-xl mt-3">@{profile?.handle || "anon"}</h1>
        {profile?.bio && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">{profile.bio}</p>}
        <div className="mt-3"><FollowStats userId={userId} /></div>
      </div>
    </div>
  );
}