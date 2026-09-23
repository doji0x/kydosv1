import React from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, SearchX } from 'lucide-react';
import { formatCompact, formatPrice, identityFor, marketPath, shortMint } from '@/lib/markets';
import { MarketAvatar, PriceChange, WatchButton } from './MarketPrimitives';

export default function MarketTable({ tokens, interval, watchlist, loading, tab, searching }) {
  if (!tokens.length && !loading) return <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center"><SearchX className="mx-auto h-7 w-7 text-muted-foreground"/><h2 className="mt-4 text-sm font-medium">{tab === 'watchlist' && !watchlist.saved.length ? 'Your watchlist starts here' : 'No coins to show'}</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{tab === 'watchlist' && !watchlist.saved.length ? 'Tap a star to save a coin on this browser. No wallet needed.' : searching ? 'Try a name, ticker or mint address, or adjust your filters.' : 'Try another list or check back when market data updates.'}</p></div>;
  return <div className="overflow-hidden rounded-xl border border-border bg-card/40"><table className="w-full table-fixed text-sm">
    <caption className="sr-only">Solana markets. USD values; change and volume use the {interval} interval.</caption>
    <thead className="border-b border-border bg-white/[0.02] text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
      <th scope="col" className="w-11 py-3"><span className="sr-only">Watchlist</span></th><th scope="col" className="py-3 text-left font-medium">Token</th><th scope="col" className="w-[112px] py-3 pr-4 text-right font-medium sm:w-36 lg:pr-6">Price <span className="lg:hidden">/ {interval}</span></th>
      <th scope="col" className="hidden w-28 py-3 pr-6 text-right font-medium lg:table-cell">{interval} change</th><th scope="col" className="hidden w-32 py-3 pr-6 text-right font-medium md:table-cell">{interval} volume</th><th scope="col" className="hidden w-32 py-3 pr-6 text-right font-medium xl:table-cell">Liquidity</th><th scope="col" className="hidden w-32 py-3 pr-6 text-right font-medium xl:table-cell">Market cap</th>
    </tr></thead>
    <tbody className="divide-y divide-border/70">
      {loading && !tokens.length ? Array.from({ length: 6 }, (_, index) => <tr key={index} aria-hidden="true"><td colSpan={7} className="p-4"><div className="h-10 animate-pulse rounded bg-muted/60"/></td></tr>) : tokens.map(token => {
        const identity = identityFor(token.mint), stats = token.stats?.[interval];
        return <tr key={token.mint} className="transition-colors hover:bg-white/[0.025]">
          <td><WatchButton token={token} watchlist={watchlist}/></td><td className="py-3 pr-2"><Link to={marketPath(token.mint)} className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 focus-visible:outline focus-visible:outline-primary sm:gap-3">
            <span className="hidden w-5 shrink-0 text-right font-mono text-xs text-muted-foreground sm:inline">{token.rank}</span><MarketAvatar token={token}/><span className="min-w-0"><span className="flex items-center gap-1.5"><span className="truncate font-semibold">{token.symbol}</span>{token.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-label="Listed as verified by Jupiter"/>}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={`${token.name} · ${token.mint}`}>{identity?.wrapper || token.name}<span className="hidden sm:inline"> · {shortMint(token.mint)}</span></span></span>
          </Link><p className="mt-1 pl-0.5 text-[10px] text-muted-foreground md:hidden">Vol {formatCompact(stats?.volume)} · Liq {formatCompact(token.liquidity)}</p></td><td className="py-3 pr-4 text-right font-mono text-xs tabular-nums sm:text-sm lg:pr-6"><span>{formatPrice(token.price)}</span><div className="mt-1 text-[11px] lg:hidden"><PriceChange value={stats?.priceChange}/></div></td>
          <td className="hidden py-3 pr-6 text-right text-xs lg:table-cell"><PriceChange value={stats?.priceChange}/></td><td className="hidden py-3 pr-6 text-right font-mono text-xs md:table-cell">{formatCompact(stats?.volume)}</td><td className="hidden py-3 pr-6 text-right font-mono text-xs xl:table-cell">{formatCompact(token.liquidity)}</td><td className="hidden py-3 pr-6 text-right font-mono text-xs xl:table-cell">{formatCompact(token.marketCap)}</td>
        </tr>;
      })}
    </tbody>
  </table>{loading && <span className="sr-only" role="status">Loading markets</span>}</div>;
}
