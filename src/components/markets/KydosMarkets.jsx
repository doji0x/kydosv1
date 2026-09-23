import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useMe } from '@/lib/MeContext';
import BoardTokenCard from '@/components/board/BoardTokenCard';

export default function KydosMarkets() {
  const { me } = useMe();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['kydos-board', me?.id], enabled: !!me?.id, queryFn: async () => (await base44.functions.invoke('solanaBoard', {})).data, refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 1 });
  if (!me) return <div className="rounded-xl border border-border p-10 text-center"><h2 className="font-medium">Kydos launches</h2><p className="mt-2 text-sm text-muted-foreground">Sign in to browse indexed Kydos markets and their bonding curves.</p><Link to="/login" className="mt-5 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">Sign in</Link></div>;
  return <section aria-label="Kydos launch markets"><p className="mb-4 text-xs leading-relaxed text-muted-foreground">{data?.network?.name || 'Configured Solana network'} · Latest 200 indexed launches · {data?.partial ? 'Incomplete volume sample; ordered by launch time.' : 'Ranked by finalized 24h SOL volume.'}</p>
    {error && <p role="alert" className="mb-4 text-sm text-amber-200">Kydos market data is unavailable. <button type="button" onClick={() => refetch()} className="underline">Retry</button></p>}
    <div className="grid gap-3 lg:grid-cols-2">{data?.tokens?.map((token, index) => <BoardTokenCard key={token.mint} token={token} index={index} partial={data.partial}/>)}</div>
    {!data?.tokens?.length && <p role="status" className="py-16 text-center text-sm text-muted-foreground">{isPending ? 'Loading Kydos markets…' : 'No confirmed Kydos launches indexed yet.'}</p>}
  </section>;
}
