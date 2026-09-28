import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ensureProfile } from "@/lib/profile";
import { useSolanaWallet } from '@/lib/SolanaWalletContext';

const Ctx = createContext({ me: undefined, likedIds: new Set(), refresh: () => {}, toggleLike: () => {} });

export function MeProvider({ children }) {
  const wallet = useSolanaWallet();
  const walletId = wallet.publicKey?.toBase58();
  const [me, setMe] = useState(undefined);
  const [likedIds, setLikedIds] = useState(new Set());

  const refresh = useCallback(async () => {
    if (!walletId) { setMe(null); return; }
    const identity = { id: walletId };
    const profile = await ensureProfile(identity);
    setMe({ ...identity, profile });
  }, [walletId]);

  useEffect(() => { setMe(undefined); refresh().catch(() => setMe(null)); }, [refresh]);
  useEffect(() => {
    if (wallet.connected) return;
    const provider = window.phantom?.solana ?? window.solana;
    if (provider?.isPhantom) provider.connect({ onlyIfTrusted: true }).catch(() => {});
  }, [wallet.connected]);

  useEffect(() => {
    if (!me?.id) { setLikedIds(new Set()); return; }
    const load = () =>
      base44.entities.PostLike.filter({ user_id: me.id }, "-created_date", 500)
        .then((l) => setLikedIds(new Set(l.map((x) => x.post_id))));
    load();
    return base44.entities.PostLike.subscribe(load);
  }, [me?.id]);

  const toggleLike = useCallback(async (post) => {
    if (!me) return;
    const liked = likedIds.has(post.id);
    setLikedIds((prev) => { const n = new Set(prev); liked ? n.delete(post.id) : n.add(post.id); return n; });
    if (liked) {
      const [rec] = await base44.entities.PostLike.filter({ user_id: me.id, post_id: post.id });
      if (rec) await base44.entities.PostLike.delete(rec.id);
      await base44.entities.Post.update(post.id, { like_count: Math.max(0, (post.like_count || 0) - 1) });
    } else {
      await base44.entities.PostLike.create({ user_id: me.id, post_id: post.id });
      await base44.entities.Post.update(post.id, { like_count: (post.like_count || 0) + 1 });
    }
  }, [me, likedIds]);

  return <Ctx.Provider value={{ me, likedIds, refresh, toggleLike }}>{children}</Ctx.Provider>;
}

export const useMe = () => useContext(Ctx);