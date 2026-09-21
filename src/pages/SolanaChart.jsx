import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import TokenPriceChart from '@/components/solana/TokenPriceChart';
import IndexedTradeSample from '@/components/solana/IndexedTradeSample';

const formatTime = value => value ? new Date(value * 1000).toLocaleString() : '—';
export default function SolanaChart() {
  const { mint } = useParams();
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [cursor, setCursor] = useState(null);
  const load = useCallback(async backfill => {
    setLoading(true); setError('');
    try {
      const response = await base44.functions.invoke('solanaTokenChart', { mint, pages: backfill ? 5 : 1, before: backfill ? cursor : undefined });
      setData(response.data); setCursor(response.data.nextBefore);
    } catch (failure) { setError(failure?.response?.data?.error || failure.message); }
    finally { setLoading(false); }
  }, [mint, cursor]);
  useEffect(() => { load(false); }, [mint]);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
    <header className="space-y-4 border-b border-border pb-5"><div className="flex flex-wrap items-start justify-between gap-4"><div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Helius index experiment</p><h1 className="mt-2 font-display text-3xl font-bold">Price / SOL</h1>
      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{mint}</p></div><div className="flex gap-2">
      <Button variant="outline" onClick={() => load(true)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Backfill</Button>
      <Button asChild><a href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">Compare on pump.fun<ExternalLink className="ml-2 h-4 w-4"/></a></Button>
    </div></div>{data && <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground"><span>{data.tradeCount} cached transactions</span><span>{formatTime(data.earliest)} → {formatTime(data.latest)}</span><span>{data.series.length} chart points</span></div>}</header>
    {loading && !data && <p role="status" className="py-20 text-center text-sm text-muted-foreground">Indexing Helius transaction history…</p>}
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
    {data && <><section className="rounded-xl border border-border bg-card/70 p-3 md:p-5">{data.series.length ? <TokenPriceChart series={data.series}/> : <p className="py-32 text-center text-sm text-muted-foreground">No priceable swaps found in this range.</p>}</section>
    <section><h2 className="font-display text-lg font-semibold">Raw indexed sample</h2><p className="mt-1 text-xs text-muted-foreground">Use these transfers and signatures to spot-check the derived price.</p><IndexedTradeSample trades={data.sample || []}/></section></>}
  </main>;
}