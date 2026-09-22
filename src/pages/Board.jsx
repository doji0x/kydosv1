import React, { useEffect, useState } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import BoardTokenCard from '@/components/board/BoardTokenCard';
export default function Board() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true, loading = false;
    const load = async () => {
      if (loading) return; loading = true;
      try { const result = await base44.functions.invoke('solanaBoard', {}); if (active) { setData(result.data); setError(''); } }
      catch (reason) { if (active) setError(reason?.response?.data?.error || reason.message); }
      finally { loading = false; }
    };
    load(); const timer = setInterval(load, 30000); return () => { active = false; clearInterval(timer); };
  }, []);
  return <main className="mx-auto min-h-screen max-w-2xl border-x border-border/60">
    <header className="sticky top-14 z-30 border-b border-border/60 bg-background/85 px-4 py-4 backdrop-blur-xl"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary"/><h1 className="font-display text-xl font-semibold">{data?.partial ? 'Recent Kydos markets' : 'Trending on Kydos'}</h1></div><p className="mt-1 text-xs text-muted-foreground">{data?.network?.name || 'Solana'} · Latest 200 indexed launches · {data?.partial ? 'Volume sample incomplete; sorted by launch time.' : 'Ranked by finalized 24h SOL volume.'}</p></header>
    {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
    <div className="space-y-3 p-4">{!data && !error ? [0, 1, 2].map(i => <Skeleton key={i} className="h-[90px] rounded-xl"/>) : data?.tokens.length ? data.tokens.map((token, index) => <BoardTokenCard key={token.mint} token={token} index={index} partial={data.partial}/>) : <div className="py-24 text-center"><Activity className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">No confirmed Kydos launches indexed yet.</p></div>}</div>
  </main>;
}
