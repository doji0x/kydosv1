import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/MeContext';
import WalletConnectPrompt from '@/components/profile/WalletConnectPrompt';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileEditDialog from '@/components/profile/ProfileEditDialog';
import ProfileTabs from '@/components/profile/ProfileTabs';

export default function Profile() {
  const { userId } = useParams(), { me } = useMe();
  const targetId = userId || me?.id, isMe = !!me && targetId === me.id;
  const [profile, setProfile] = useState(undefined), [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!targetId) { setProfile(undefined); return; }
    const load = () => base44.entities.Profile.filter({ user_id: targetId }).then(([p]) => setProfile(p || null));
    load();
    return base44.entities.Profile.subscribe(load);
  }, [targetId]);
  if (!userId && me === null) return <WalletConnectPrompt />;
  if (!targetId || profile === undefined) return <div className="mx-auto max-w-2xl"><Skeleton className="h-28"/><Skeleton className="h-20 w-20 rounded-full -mt-10 ml-4 ring-4 ring-background"/></div>;
  return <div className="mx-auto max-w-2xl min-h-screen border-x border-border/60">
    <ProfileHeader profile={profile} userId={targetId} isMe={isMe} onEdit={() => setEditing(true)}/>
    <div className="mt-4"><ProfileTabs userId={targetId}/></div>
    {isMe && profile && <ProfileEditDialog key={profile.updated_date} profile={profile} open={editing} onOpenChange={setEditing}/>}
  </div>;
}