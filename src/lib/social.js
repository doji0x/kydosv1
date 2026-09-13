import { base44 } from "@/api/base44Client";

function authorFields(me) {
  return {
    author_id: me.id,
    author_handle: me.profile?.handle || "anon",
    author_avatar: me.profile?.avatar_url || "",
  };
}

export async function createPost(me, { body, image_url, token, reply_to }) {
  const post = await base44.entities.Post.create({
    ...authorFields(me),
    body,
    image_url: image_url || "",
    token_id: token?.id || "",
    token_ticker: token?.ticker || "",
    reply_to: reply_to || "",
    like_count: 0, reply_count: 0, repost_count: 0,
  });
  if (reply_to) {
    const parent = await base44.entities.Post.get(reply_to);
    await base44.entities.Post.update(reply_to, { reply_count: (parent.reply_count || 0) + 1 });
  }
  return post;
}

export async function repost(me, post) {
  await base44.entities.Post.create({
    ...authorFields(me),
    body: post.body,
    image_url: post.image_url || "",
    token_id: post.token_id || "",
    token_ticker: post.token_ticker || "",
    repost_of: post.repost_of || post.id,
    like_count: 0, reply_count: 0, repost_count: 0,
  });
  await base44.entities.Post.update(post.id, { repost_count: (post.repost_count || 0) + 1 });
}