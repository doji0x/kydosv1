import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/MeContext";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileEditDialog from "@/components/profile/ProfileEditDialog";
import ProfileTabs from "@/components/profile/ProfileTabs";
import TokenCard from "@/components/tokens/TokenCard";

export default function Profile() {
  const { userId } = useParams();
  const { me } = useMe();
  const targetId = userId || me?.id;
  const isMe = !!me && targetId === me.id;
  const [profile, setProfile] = useState(undefined);
  const [tokens, setTokens] = useState([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    const load = () => base44.entities.Profile.filter({ user_id: targetId }).then(([p]) => setProfile(p || null));
    load();
    return base44.entities.Profile.subscribe(load);
  }, [targetId]);

  useEffect(() => {
    if (!targetId) return;
    const load = () => base44.entities.Token.filter({ creator_id: targetId }, "-created_date", 50).then(setTokens);
    load();
    return base44.entities.Token.subscribe(load);
  }, [targetId]);

  if (me === null && !userId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Your profile lives here</h1>
        <p className="text-muted-foreground mt-2 text-sm">Sign in to post, follow traders, and launch tokens.</p>
        <Button onClick={() => base44.auth.redirectToLogin()} className="mt-6 rounded-full px-8 gold-glow font-semibold">Sign in</Button>
      </div>
    );
  }

  if (!targetId || profile === undefined) {
    return <div className="mx-auto max-w-2xl"><Skeleton className="h-28" /><Skeleton className="h-20 w-20 rounded-full -mt-10 ml-4 ring-4 ring-background" /><Skeleton className="h-6 w-40 m-4" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl border-x border-border/60 min-h-screen">
      <ProfileHeader profile={profile} userId={targetId} isMe={isMe} onEdit={() => setEditing(true)} />
      {tokens.length > 0 && (
        <section className="px-4 mt-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Launched · {tokens.length}</p>
          <div className="grid grid-cols-2 gap-3">{tokens.map((t, i) => <TokenCard key={t.id} token={t} index={i} />)}</div>
        </section>
      )}
      <div className="mt-4"><ProfileTabs userId={targetId} /></div>
      {isMe && profile && <ProfileEditDialog key={profile.updated_date} profile={profile} open={editing} onOpenChange={setEditing} />}
    </div>
  );
}