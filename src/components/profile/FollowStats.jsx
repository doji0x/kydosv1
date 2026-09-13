import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function FollowStats({ userId }) {
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  useEffect(() => {
    const load = async () => {
      const [followers, following] = await Promise.all([
        base44.entities.Follow.filter({ followee_id: userId }, "-created_date", 1000),
        base44.entities.Follow.filter({ follower_id: userId }, "-created_date", 1000),
      ]);
      setCounts({ followers: followers.length, following: following.length });
    };
    load();
    return base44.entities.Follow.subscribe(load);
  }, [userId]);

  return (
    <div className="flex gap-5 text-sm">
      <span><span className="font-semibold">{counts.followers}</span> <span className="text-muted-foreground">followers</span></span>
      <span><span className="font-semibold">{counts.following}</span> <span className="text-muted-foreground">following</span></span>
    </div>
  );
}