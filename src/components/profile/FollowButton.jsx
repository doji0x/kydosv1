import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/MeContext";
import { useSignInGate } from "@/lib/SignInGate";

export default function FollowButton({ targetId }) {
  const { me } = useMe();
  const { requireAuth } = useSignInGate();
  const [rec, setRec] = useState(undefined);

  useEffect(() => {
    if (!me?.id) return;
    const load = () => base44.entities.Follow.filter({ follower_id: me.id, followee_id: targetId }).then(([r]) => setRec(r || null));
    load();
    return base44.entities.Follow.subscribe(load);
  }, [me?.id, targetId]);

  const toggle = async () => {
    if (!requireAuth("follow")) return;
    if (rec) { setRec(null); await base44.entities.Follow.delete(rec.id); }
    else { const r = await base44.entities.Follow.create({ follower_id: me.id, followee_id: targetId }); setRec(r); }
  };

  const following = !!rec;
  return (
    <Button onClick={toggle} variant={following ? "outline" : "default"} className="rounded-full px-5 font-semibold h-9">
      {following ? "Following" : "Follow"}
    </Button>
  );
}