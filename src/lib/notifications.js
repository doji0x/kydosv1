import { base44 } from '@/api/base44Client';
const SEEN_KEY='kydos_notifs_seen_at';
export const getSeenAt=()=>Number(localStorage.getItem(SEEN_KEY)||0);
export const markSeen=()=>localStorage.setItem(SEEN_KEY,String(Date.now()));
export async function fetchNotifications(me){
 const [myPosts,follows]=await Promise.all([base44.entities.Post.filter({author_id:me.id},'-created_date',200),base44.entities.Follow.filter({followee_id:me.id},'-created_date',100)]);
 const postIds=myPosts.map(post=>post.id),handle=me.profile?.handle;
 const [likes,replies,mentions]=await Promise.all([
  postIds.length?base44.entities.PostLike.filter({post_id:{$in:postIds}},'-created_date',200):[],
  postIds.length?base44.entities.Post.filter({reply_to:{$in:postIds}},'-created_date',100):[],
  handle?base44.entities.Post.filter({body:{$regex:`@${handle}(\\b|$)`,$options:'i'}},'-created_date',100):[]
 ]);
 const bodyOf=Object.fromEntries(myPosts.map(post=>[post.id,post.body])),items=[];
 likes.forEach(item=>{if(item.user_id!==me.id)items.push({id:`l${item.id}`,type:'like',actor_id:item.user_id,created_date:item.created_date,post_id:item.post_id,preview:bodyOf[item.post_id]});});
 replies.forEach(item=>{if(item.author_id!==me.id)items.push({id:`r${item.id}`,type:'reply',actor_id:item.author_id,created_date:item.created_date,post_id:item.id,preview:item.body});});
 mentions.forEach(item=>{if(item.author_id!==me.id&&!items.some(value=>value.id===`r${item.id}`))items.push({id:`m${item.id}`,type:'mention',actor_id:item.author_id,created_date:item.created_date,post_id:item.id,preview:item.body});});
 follows.forEach(item=>items.push({id:`f${item.id}`,type:'follow',actor_id:item.follower_id,created_date:item.created_date}));
 const actors=[...new Set(items.map(item=>item.actor_id))],profiles=actors.length?await base44.entities.Profile.filter({user_id:{$in:actors}},'-created_date',200):[],byUser=Object.fromEntries(profiles.map(profile=>[profile.user_id,profile]));
 return items.sort((a,b)=>new Date(b.created_date)-new Date(a.created_date)).slice(0,60).map(item=>({...item,handle:byUser[item.actor_id]?.handle||'anon',avatar:byUser[item.actor_id]?.avatar_url}));
}