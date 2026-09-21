import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const short = value => `${value.slice(0, 6)}…${value.slice(-6)}`;
export default function MarketHeader({ mint, market }) {
  return <header><Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Back to Board</Link>
    <div className="flex items-end justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Mainnet market</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{market ? `${market.name} · ${market.symbol}` : 'Loading market'}</h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground" title={mint}>{short(mint)}</p></div>
      {market && <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{market.graduated ? 'Graduated' : 'Bonding curve'}</span>}</div>
  </header>;
}