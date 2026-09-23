import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
const short = value => `${value.slice(0, 5)}…${value.slice(-5)}`;
export default function BoardTokenCard({ token, index, partial }) {
  const ratio = token.trades ? Math.round(token.buys / token.trades * 100) : 0;
  return <Link to={`/solana/${token.mint}`} className="group block"><Card className="bg-card/70 p-4 transition-colors group-hover:border-primary/40"><div className="flex items-center gap-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono font-bold text-primary">{index + 1}</div>
    <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{token.name || short(token.mint)} {token.symbol && <span className="text-muted-foreground">· {token.symbol}</span>}</h2><p className="text-xs text-muted-foreground">{token.trades ? `${token.trades} trades · ${ratio}% buys` : 'No trades in this window'}</p></div>
    <div className="text-right"><p className="font-mono text-sm text-primary">{token.volume.toFixed(3)} SOL</p><p className="text-[11px] text-muted-foreground">{partial ? 'sampled volume' : '24h volume'}</p></div><ArrowUpRight className="h-4 w-4 text-muted-foreground"/>
  </div></Card></Link>;
}
