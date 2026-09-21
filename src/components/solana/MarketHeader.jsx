import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCompact, formatPrice } from '@/lib/solana/marketMetrics';

const short = value => `${value.slice(0, 6)}…${value.slice(-6)}`;
export default function MarketHeader({ mint, market, marketInfo, metrics }) {
  const name = marketInfo?.name || market?.name || 'Solana token';
  const symbol = marketInfo?.symbol || market?.symbol || short(mint);
  return <header><Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Back to Board</Link>
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Mainnet market</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{name} · {symbol}</h1><p className="mt-2 font-mono text-xs text-muted-foreground" title={mint}>{short(mint)}</p></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 md:text-right"><div><p className="text-xs text-muted-foreground">Price</p><p className="font-mono text-lg font-semibold">{formatPrice(metrics.priceSol, '', ' SOL')}</p><p className="gold-text font-mono text-sm font-semibold">{formatPrice(metrics.priceUsd, '$')}</p></div>
      <div><p className="text-xs text-muted-foreground">Market cap</p><p className="font-mono text-lg font-semibold">{formatCompact(metrics.marketCapSol, '', ' SOL')}</p><p className="gold-text font-mono text-sm font-semibold">{formatCompact(metrics.marketCapUsd, '$')}</p></div></div></div>
  </header>;
}