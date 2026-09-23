import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BadgeCheck } from 'lucide-react';
import useMarketDiscovery from '@/hooks/useMarketDiscovery';
import useMarketWatchlist from '@/hooks/useMarketWatchlist';
import { emptyToken, formatCompact, formatPrice, identityFor, isSolanaMint, MARKET_INTERVALS, shortMint } from '@/lib/markets';
import { MarketAvatar, MarketDataNotice, MintCopy, PriceChange, SnapshotStamp, WatchButton } from '@/components/markets/MarketPrimitives';
import ExternalMarketChart from '@/components/markets/ExternalMarketChart';

export default function ExternalMarket() {
  const { mint } = useParams(), market = useMarketDiscovery(), watchlist = useMarketWatchlist();
  if (!isSolanaMint(mint)) return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6"><Link to="/" className="text-sm text-primary">Back to Discover</Link><h1 className="mt-6 text-2xl font-semibold">Invalid Solana mint</h1><p className="mt-3 text-sm text-muted-foreground">Open a coin from Discover to view its market.</p></div>;
  const identity = identityFor(mint), saved = watchlist.saved.find(token => token.mint === mint);
  const token = market.snapshot.tokens.find(item => item.mint === mint) || emptyToken(identity || saved || { mint, name: 'Solana token', symbol: shortMint(mint) });
  const stats = token.stats?.['24h'];
  const metrics = [
    ['24h volume', formatCompact(stats?.volume)], ['Liquidity', formatCompact(token.liquidity)],
    ['Market cap', formatCompact(token.marketCap)], ['Fully diluted value', formatCompact(token.fdv)],
    ['Holders', formatCompact(token.holders, false)], ['24h traders', formatCompact(stats?.traders, false)],
  ];
  return <div className="mx-auto max-w-7xl px-4 pt-7 sm:px-6 sm:pt-9">
    <Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4"/>Back to Discover</Link>
    <MarketDataNotice market={market}/>
    <header className="mb-7 flex flex-wrap items-center justify-between gap-5"><div className="flex min-w-0 items-center gap-4"><MarketAvatar token={token} large/><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate font-display text-2xl font-semibold sm:text-3xl">{token.symbol}</h1>{token.verified && <BadgeCheck className="h-5 w-5 shrink-0 text-sky-400" aria-label="Listed as verified by Jupiter"/>}<WatchButton token={token} watchlist={watchlist}/></div><p className="text-sm text-muted-foreground">{token.name} · Solana mainnet</p><MintCopy mint={mint}/></div></div><a href={`https://jup.ag/tokens/${mint}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-xs font-medium text-muted-foreground hover:text-primary">View on Jupiter<ArrowUpRight className="h-4 w-4"/></a></header>
    {watchlist.error && <p role="status" className="mb-4 text-xs text-amber-200">{watchlist.error}</p>}
    <ExternalMarketChart key={mint} mint={mint} symbol={token.symbol}/>
    {!token.available && <p role="status" className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Jupiter summary statistics are unavailable for this coin. Its price history loads separately above.</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section aria-label="Price overview" className="rounded-2xl border border-border bg-card/70 p-5 sm:p-7"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Price · USD</h2><SnapshotStamp market={market}/></div><p className="break-all font-mono text-3xl font-medium tracking-tight sm:text-4xl">{formatPrice(token.price)}</p><p className="mt-3 text-sm"><PriceChange value={stats?.priceChange}/><span className="ml-2 text-xs text-muted-foreground">past 24 hours</span></p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{MARKET_INTERVALS.map(interval => <div key={interval} className="rounded-lg border border-border bg-background/40 p-3"><p className="mb-2 text-xs text-muted-foreground">{interval} change</p><PriceChange value={token.stats?.[interval]?.priceChange} className="text-sm"/></div>)}</div>
        <div className="mt-7 grid grid-cols-2 gap-4 border-t border-border pt-5"><div><p className="text-xs text-muted-foreground">24h buys</p><p className="mt-2 font-mono text-lg text-emerald-400">{formatCompact(stats?.buys, false)}</p></div><div><p className="text-xs text-muted-foreground">24h sells</p><p className="mt-2 font-mono text-lg text-rose-400">{formatCompact(stats?.sells, false)}</p></div></div>
      </section>
      <section aria-label="Market statistics" className="rounded-2xl border border-border bg-card/70 p-5 sm:p-7"><h2 className="mb-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Market overview</h2><dl className="divide-y divide-border">{metrics.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-3.5 first:pt-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-mono text-sm">{value}</dd></div>)}</dl></section>
    </div>
    <section aria-label="Token identity" className="mt-5 rounded-xl border border-border p-5 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">About this asset</h2><a href={`https://solscan.io/token/${mint}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">Inspect on Solscan<ArrowUpRight className="h-3.5 w-3.5"/></a></div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{identity?.kind === 'wrapped' ? `${identity.wrapper}. This is the Solana representation of the asset. Global BTC/ETH market caps are not shown as this token’s market cap.` : identity?.kind === 'native' ? 'SOL market data uses the wrapped SOL mint. Native SOL in a wallet and SPL wrapped SOL are separate balances.' : 'This overview identifies the token by its Solana mint address. Token names and symbols can be shared by unrelated coins.'}</p><p className="mt-3 break-all font-mono text-xs text-muted-foreground">{mint}</p>
    </section><p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Data from Jupiter Tokens V2. Missing values are shown as —. {token.providerUpdatedAt && `Provider updated ${new Date(token.providerUpdatedAt).toLocaleString()}.`} Jupiter opens in a new tab.</p>
  </div>;
}
