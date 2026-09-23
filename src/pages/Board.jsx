import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Search, SlidersHorizontal, Star, TrendingUp, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMe } from '@/lib/MeContext';
import useMarketDiscovery from '@/hooks/useMarketDiscovery';
import useMarketWatchlist from '@/hooks/useMarketWatchlist';
import { MARKET_INTERVALS, MARKET_TABS, readMarketOptions, selectMarkets } from '@/lib/markets';
import FeaturedMarkets from '@/components/markets/FeaturedMarkets';
import MarketTable from '@/components/markets/MarketTable';
import KydosMarkets from '@/components/markets/KydosMarkets';
import { MarketDataNotice, SnapshotStamp } from '@/components/markets/MarketPrimitives';

function AdminRefresh({ onRefresh }) {
  const { me } = useMe(), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  if (me?.role !== 'admin') return null;
  const refresh = async () => {
    setBusy(true); setMessage('');
    try { await base44.functions.invoke('refreshMarketDiscovery', {}); await onRefresh(); setMessage('Shared snapshot refreshed.'); }
    catch (error) { setMessage(error?.response?.data?.error || 'Market refresh failed. Check the backend configuration.'); }
    finally { setBusy(false); }
  };
  return <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-xs text-muted-foreground"><span>Admin</span><button type="button" onClick={refresh} disabled={busy} className="rounded-lg border border-border px-3 py-2 hover:text-foreground disabled:opacity-50">{busy ? 'Refreshing Jupiter data…' : 'Refresh shared market data'}</button><span role="status">{message}</span></div>;
}
export default function Board() {
  const market = useMarketDiscovery(), watchlist = useMarketWatchlist();
  const [params, setParams] = useSearchParams(), [showFilters, setShowFilters] = useState(false);
  const options = readMarketOptions(params), isKydos = options.tab === 'kydos';
  const update = values => setParams(current => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === false || value === '0') next.delete(key); else next.set(key, String(value));
    }
    return next;
  }, { replace: true });
  const tokens = selectMarkets(market.snapshot, options, watchlist.saved);
  return <div className="mx-auto max-w-7xl px-4 pt-7 sm:px-6 sm:pt-9">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div><div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary"/>Solana mainnet</div><h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Discover<span className="text-primary">.</span></h1><p className="mt-2 text-sm text-muted-foreground">The majors. The memes. What’s moving now.</p></div>
      <Link to="/launch" className="hidden items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 sm:inline-flex">Launch a coin<ArrowUpRight className="h-4 w-4"/></Link>
    </header>
    <MarketDataNotice market={market}/><FeaturedMarkets snapshot={market.snapshot}/>
    <section aria-label="Browse markets">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-border">
        <div aria-label="Market lists" className="no-scrollbar -mb-px flex max-w-full gap-5 overflow-x-auto sm:gap-7">
          {MARKET_TABS.map(tab => <button key={tab} type="button" aria-pressed={options.tab === tab} onClick={() => update({ tab, q: '' })} className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-3 text-sm font-medium capitalize transition-colors ${options.tab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab === 'trending' && <TrendingUp className="h-4 w-4"/>}{tab === 'watchlist' && <Star className="h-3.5 w-3.5"/>}{tab}{tab === 'watchlist' && watchlist.saved.length > 0 && <span className="rounded bg-muted px-1.5 text-[10px]">{watchlist.saved.length}</span>}</button>)}
        </div><div className="mb-3 hidden sm:block"><SnapshotStamp market={market}/></div>
      </div>
      {!isKydos && <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-52"><span className="sr-only">Search listed tokens</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><input value={options.query} maxLength={100} onChange={event => update({ q: event.target.value })} placeholder="Search listed tokens…" className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"/>{options.query && <button type="button" onClick={() => update({ q: '' })} aria-label="Clear search" className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center text-muted-foreground"><X className="h-3.5 w-3.5"/></button>}</label>
          <div aria-label="Market interval" className="flex rounded-lg border border-border bg-card p-1">{MARKET_INTERVALS.map(interval => <button key={interval} type="button" aria-pressed={options.interval === interval} onClick={() => update({ interval })} className={`min-h-8 rounded-md px-3 text-xs font-medium ${options.interval === interval ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>{interval}</button>)}</div>
          <button type="button" onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters} aria-controls="market-filters" className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs ${options.verifiedOnly || options.minLiquidity ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground'}`}><SlidersHorizontal className="h-3.5 w-3.5"/>Filters</button>
        </div>
        {showFilters && <div id="market-filters" className="mb-4 flex flex-wrap items-center gap-5 rounded-lg border border-border bg-card p-4 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-400" checked={options.verifiedOnly} onChange={event => update({ verified: event.target.checked })}/>Jupiter verified</label>
          <label className="flex items-center gap-2">Min. liquidity<select value={options.minLiquidity} onChange={event => update({ liquidity: event.target.value })} className="rounded border border-border bg-background p-2"><option value="0">Any</option><option value="10000">$10K</option><option value="100000">$100K</option><option value="1000000">$1M</option></select></label>
          <label className="flex items-center gap-2">Sort<select value={options.sort} onChange={event => update({ sort: event.target.value })} className="rounded border border-border bg-background p-2"><option value="rank">List order</option><option value="change">Biggest gain</option><option value="volume">Volume</option><option value="liquidity">Liquidity</option></select></label>
          <button type="button" onClick={() => update({ verified: false, liquidity: '0', sort: 'rank' })} className="text-muted-foreground underline underline-offset-4">Reset filters</button>
        </div>}
        {watchlist.error && <p role="status" className="mb-3 text-xs text-amber-200">{watchlist.error}</p>}
        {options.tab === 'watchlist' && <p className="mb-3 text-xs text-muted-foreground">Saved on this browser. Coins outside the current feed retain their identity; their prices show as unavailable.</p>}
        <MarketTable tokens={tokens} interval={options.interval} watchlist={watchlist} loading={market.isPending} tab={options.tab} searching={!!options.query || options.verifiedOnly || !!options.minLiquidity}/>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>{tokens.length} coins · USD · {options.tab === 'trending' && !options.query ? 'Trending via Jupiter' : 'Data via Jupiter'}{options.tab === 'majors' || options.tab === 'memes' ? ' · Curated list' : ''}</span><SnapshotStamp market={market}/></div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/80">Search covers this catalog and downloaded trending lists. A Jupiter verification badge is a listing signal, not a guarantee of safety.</p>
      </>}
      {isKydos && <KydosMarkets/>}
    </section><AdminRefresh onRefresh={market.refetch}/>
  </div>;
}
