import React, { useState } from 'react';
import { ArrowLeft, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCompact, formatPrice } from '@/lib/solana/marketMetrics';
const short = value => `${value.slice(0, 6)}…${value.slice(-6)}`;
export default function MarketHeader({ mint, market, marketInfo, metrics, network }) {
  const [copied, setCopied] = useState('');
  const name = marketInfo?.name || market?.name || 'Solana token', symbol = marketInfo?.symbol || market?.symbol || short(mint);
  const copy = async () => { try { await navigator.clipboard.writeText(mint); setCopied(mint); } catch { setCopied(''); } };
  return <header><Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Back to Board</Link>
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{network?.name || 'Checking Solana network'}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{name} · {symbol}</h1><button onClick={copy} className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground" title={mint} aria-label="Copy token address">{copied === mint ? 'Copied' : short(mint)}<Copy className="h-3 w-3"/></button><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{mint}</p></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 md:text-right"><div><p className="text-xs text-muted-foreground">Last executed price</p><p className="font-mono text-lg font-semibold">{formatPrice(metrics.priceSol, '', ' SOL')}</p><p className="gold-text font-mono text-sm font-semibold">{formatPrice(metrics.priceUsd, '≈ $')}</p></div>
      <div title="Last executed price multiplied by total token supply"><p className="text-xs text-muted-foreground">FDV · total supply</p><p className="font-mono text-lg font-semibold">{formatCompact(metrics.fdvSol, '', ' SOL')}</p><p className="gold-text font-mono text-sm font-semibold">{formatCompact(metrics.fdvUsd, '≈ $')}</p></div></div></div>
  </header>;
}
