import React, { useEffect, useMemo, useState } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import BoardTokenCard from '@/components/board/BoardTokenCard';

export default function Board(){
 const [trades,setTrades]=useState(null);
 useEffect(()=>{const load=()=>base44.entities.SolanaTrade.filter({status:'confirmed'},'-block_time',200).then(setTrades);load();return base44.entities.SolanaTrade.subscribe(load);},[]);
 const tokens=useMemo(()=>{const grouped={};(trades||[]).forEach(item=>{if(!item.mint)return;const row=grouped[item.mint]||{mint:item.mint,trades:[],volume:0,latest:0};row.trades.push(item);row.volume+=Number(item.sol_amount||0);row.latest=Math.max(row.latest,Number(item.block_time||0));grouped[item.mint]=row;});return Object.values(grouped).sort((a,b)=>b.volume-a.volume||b.latest-a.latest);},[trades]);
 return <div className="mx-auto max-w-2xl min-h-screen border-x border-border/60">
  <header className="sticky top-14 z-30 border-b border-border/60 bg-background/85 px-4 py-4 backdrop-blur-xl"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary"/><h1 className="font-display text-xl font-semibold">Trending on Kydos</h1></div><p className="mt-1 text-xs text-muted-foreground">Mainnet markets ranked by recent confirmed SOL volume.</p></header>
  <div className="space-y-3 p-4">{!trades?[0,1,2,3].map(i=><Skeleton key={i} className="h-[74px] rounded-xl"/>):tokens.length?tokens.map((token,index)=><BoardTokenCard key={token.mint} token={token} index={index}/>):<div className="py-24 text-center"><Activity className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">No confirmed Kydos markets indexed yet.</p></div>}</div>
 </div>;
}