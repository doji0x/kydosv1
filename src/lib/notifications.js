import { base44 } from "@/api/base44Client";

const SEEN_KEY = "kydos_notifs_seen_at";

export const getSeenAt = () => Number(localStorage.getItem(SEEN_KEY) || 0);
export const markSeen = () => localStorage.setItem(SEEN_KEY, String(Date.now()));

// Notifications are derived live from posts, likes and follows — no extra storage.
export async function fetchNotifications(me) {
  const [myPosts, likes, recent, follows, profiles] = await Promise.all([
    base44.entities.Post.filter({ author_id: me.id }, "-created_date", 200),
    base44.entities.PostLike.list("-created_date", 500),
    base44.entities.Post.list("-created_date", 300),
    base44.entities.Follow.filter({ followee_id: me.id }, "-created_date", 200),
    base44.entities.Profile.list("-created_date", 500),
  ]);

  const mine = new Set(myPosts.map((p) => p.id));
  const bodyOf = Object.fromEntries([...myPosts, ...recent].map((p) => [p.id, p.body]));
  const byUser = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
  const handle = me.profile?.handle;
  const items = [];

  likes.forEach((l) => {
    if (!mine.has(l.post_id) || l.user_id === me.id) return;
    items.push({ id: `l${l.id}`, type: "like", actor_id: l.user_id, created_date: l.created_date, post_id: l.post_id, preview: bodyOf[l.post_id] });
  });

  recent.forEach((p) => {
    if (p.author_id === me.id) return;
    if (p.reply_to && mine.has(p.reply_to)) {
      items.push({ id: `r${p.id}`, type: "reply", actor_id: p.author_id, created_date: p.created_date, post_id: p.id, preview: p.body });
    } else if (handle && new RegExp(`@${handle}(\\b|$)`, "i").test(p.body || "")) {
      items.push({ id: `m${p.id}`, type: "mention", actor_id: p.author_id, created_date: p.created_date, post_id: p.id, preview: p.body });
    }
  });

  follows.forEach((f) => {
    items.push({ id: `f${f.id}`, type: "follow", actor_id: f.follower_id, created_date: f.created_date });
  });

  return items
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 60)
    .map((n) => ({ ...n, handle: byUser[n.actor_id]?.handle || "anon", avatar: byUser[n.actor_id]?.avatar_url }));
}