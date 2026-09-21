import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Flame } from 'lucide-react';
import { Card } from '@/components/ui/card';

const short=value=>`${value.slice(0,5)}…${value.slice(-5)}`;
export default function BoardTokenCard({token,index}){
 const buys=token.trades.filter(item=>item.side==='buy').length;
 const ratio=Math.round((buys/token.trades.length)*100);
 return <Link to={`/solana/${token.mint}`} className="block group">
  <Card className="p-4 bg-card/70 transition-colors group-hover:border-primary/40">
   <div className="flex items-center gap-3">
    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold">{index+1}</div>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-mono font-semibold truncate">{short(token.mint)}</h2>{index<3&&<Flame className="h-4 w-4 text-primary"/>}</div><p className="text-xs text-muted-foreground">{token.trades.length} confirmed trades · {ratio}% buys</p></div>
    <div className="text-right"><p className="font-mono text-sm text-primary">{token.volume.toFixed(3)} SOL</p><p className="text-[11px] text-muted-foreground">volume</p></div>
    <ArrowUpRight className="h-4 w-4 text-muted-foreground"/>
   </div>
  </Card>
 </Link>;
}