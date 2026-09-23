import React, { useEffect, useState } from 'react';
import { Check, Copy, Star, RefreshCw, CircleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ageLabel, formatChange, identityFor, shortMint } from '@/lib/markets';

export function MarketAvatar({ token, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [token.icon]);
  const color = identityFor(token.mint)?.group === 'major' ? 'bg-primary/10 text-primary ring-primary/20' : 'bg-violet-400/10 text-violet-200 ring-violet-300/20';
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ${large ? 'h-14 w-14 text-xl' : 'h-9 w-9 text-sm'} ${color}`}>
    {token.icon?.startsWith('https://') && !failed ? <img src={token.icon} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : token.symbol.slice(0, 2).toUpperCase()}
  </span>;
}
export function PriceChange({ value, className = '' }) {
  const color = typeof value !== 'number' || !Number.isFinite(value) || value === 0 ? 'text-muted-foreground' : value > 0 ? 'text-emerald-400' : 'text-rose-400';
  return <span className={`font-mono tabular-nums ${color} ${className}`}>{formatChange(value)}</span>;
}
export function WatchButton({ token, watchlist }) {
  const active = watchlist.has(token.mint);
  return <button type="button" onClick={() => watchlist.toggle(token)} aria-label={`${active ? 'Remove' : 'Add'} ${token.symbol} ${active ? 'from' : 'to'} watchlist`} aria-pressed={active} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? 'text-primary' : 'text-muted-foreground'}`}><Star className="h-4 w-4" fill={active ? 'currentColor' : 'none'}/></button>;
}
export function MintCopy({ mint }) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-2"><button type="button" title={mint} onClick={async () => { try { await navigator.clipboard.writeText(mint); setCopied(true); setFailed(false); } catch { setFailed(true); } }} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 font-mono text-xs text-muted-foreground hover:text-foreground" aria-label={`Copy mint ${mint}`}>
    {shortMint(mint)}{copied ? <Check className="h-3 w-3 text-emerald-400"/> : <Copy className="h-3 w-3"/>}
  </button>{failed && <span role="status" className="max-w-full break-all text-xs text-muted-foreground">Copy manually: {mint}</span>}</span>;
}
export function SnapshotStamp({ market }) {
  const { status, snapshot, now } = market;
  return <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" title={snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toISOString() : undefined}><span className={`h-1.5 w-1.5 rounded-full ${status === 'fresh' ? 'bg-emerald-400' : 'bg-amber-400'}`}/>{ageLabel(snapshot.fetchedAt, now)}</span>;
}
export function MarketDataNotice({ market }) {
  const { error, status, snapshot, isPending, isFetching, refetch } = market;
  if (!error && status === 'fresh') return null;
  const needsLogin = error?.status === 401 || error?.status === 403;
  const message = needsLogin ? error.message : isPending ? 'Loading Solana markets…' : !snapshot.fetchedAt ? 'Market data is not available yet. Featured coins are ready to explore.' : status === 'unavailable' ? 'Market updates are unavailable. Prices below are historical and may have changed.' : status === 'stale' ? 'Market updates are delayed. Showing the last complete snapshot.' : 'The latest refresh failed. Showing the last complete snapshot.';
  return <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100/90"><span className="flex min-w-0 items-center gap-2"><CircleAlert className="h-4 w-4 shrink-0"/>{message}</span>{needsLogin ? <Link to="/login" className="font-medium underline underline-offset-4">Sign in</Link> : <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-8 items-center gap-2 font-medium disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}/>{isFetching ? 'Updating' : 'Retry'}</button>}</div>;
}
