import React, { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TIMEFRAMES, bucketTrades } from '@/lib/solana/candles';
import MarketCandleChart from './MarketCandleChart';

const price = value => value ? value.toExponential(6) : '—';
export default function MarketChartSection({ feed }) {
  const [frame, setFrame] = useState(TIMEFRAMES[0]);
  const candles = useMemo(() => bucketTrades(feed.trades, frame.seconds), [feed.trades, frame]);
  const last = feed.trades.at(-1)?.price;
  return <section className="overflow-hidden rounded-xl border border-border bg-card/70">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 md:p-4"><div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${feed.stale ? 'bg-destructive' : 'bg-green-500 animate-pulse'}`}/><span className="text-xs font-medium">{feed.stale ? 'STALE' : 'LIVE'}</span>
      <span className="rounded-md bg-secondary px-2 py-1 font-mono text-xs text-primary">{price(last)} SOL</span></div>
      <div className="flex items-center gap-1">{TIMEFRAMES.map(item => <button key={item.label} onClick={() => setFrame(item)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${frame.label === item.label ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>{item.label}</button>)}
      <Button size="sm" variant="ghost" disabled={feed.loading} onClick={feed.refreshLatest} aria-label="Refresh live trades"><RefreshCw className={feed.loading ? 'animate-spin' : ''}/></Button></div></div>
    {feed.loading && !feed.trades.length ? <Skeleton className="m-4 h-[430px]"/> : candles.length ? <MarketCandleChart key={frame.label} candles={candles}/> : <p className="py-44 text-center text-sm text-muted-foreground">No priceable swaps yet. Live indexing will continue.</p>}
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>{feed.trades.length} confirmed swaps · {candles.length} candles</span><Button size="sm" variant="outline" disabled={feed.loading || !feed.cursor} onClick={feed.backfill}>Load older</Button></div>
  </section>;
}