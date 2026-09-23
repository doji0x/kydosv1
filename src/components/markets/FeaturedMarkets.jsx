import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { MARKET_CATALOG, emptyToken, formatPrice, marketPath } from '@/lib/markets';
import { MarketAvatar, PriceChange } from './MarketPrimitives';
import MarketSparkline from './MarketSparkline';

export default function FeaturedMarkets({ snapshot }) {
  const tokens = new Map(snapshot.tokens.map(token => [token.mint, token]));
  return <section aria-label="Featured Solana coins" className="mb-8">
    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><span className="font-medium uppercase tracking-[0.18em] text-foreground/80">Featured</span><span>· Curated picks</span></div>
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 xl:grid-cols-6">
      {MARKET_CATALOG.filter(identity => identity.featured).map(identity => {
        const token = tokens.get(identity.mint) || emptyToken(identity);
        return <Link key={token.mint} to={marketPath(token.mint)} className="group min-w-[168px] snap-start rounded-xl border border-border bg-card/80 p-4 transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:min-w-0">
          <div className="mb-4 flex items-center justify-between gap-2"><MarketAvatar token={token}/><ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-primary"/></div>
          <p className="truncate text-sm font-semibold">{token.symbol}</p><p className="mb-3 truncate text-[11px] text-muted-foreground" title={identity.wrapper || token.name}>{identity.wrapper || token.name}</p>
          <MarketSparkline mint={token.mint} symbol={token.symbol}/>
          <p className="font-mono text-sm font-medium tabular-nums">{formatPrice(token.price)}</p><div className="mt-1 flex items-center gap-2 text-[11px]"><PriceChange value={token.stats?.['24h']?.priceChange}/><span className="text-muted-foreground">24h</span></div>
        </Link>;
      })}
    </div>
  </section>;
}
