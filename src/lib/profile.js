import { base44 } from "@/api/base44Client";
export function defaultHandle(user){const raw=user.handle||user.email?.split("@")[0]||"anon";return raw.toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20)||"anon";}
export async function ensureProfile(user){const[existing]=await base44.entities.Profile.filter({user_id:user.id});if(existing)return existing;return base44.entities.Profile.create({user_id:user.id,handle:defaultHandle(user),bio:user.bio||"",avatar_url:user.avatar_url||""});}
