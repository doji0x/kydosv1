import React from 'react';
import { Coins, Droplets, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
const rows=[['Supply','1B tokens',Coins],['Bonding curve','79.31% of supply',Target],['Liquidity allocation','20.69% of supply',Droplets],['Virtual reserve','30 SOL',Coins],['Curve reserves at completion','≈85.005 SOL',Target],['Trading fee','1% to Kydos treasury',Coins]];
export default function LaunchEconomics(){return <Card className="bg-card/60 p-4"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Launch economics</p><div className="grid gap-3 sm:grid-cols-3">{rows.map(([label,value,Icon])=><div key={label} className="rounded-lg bg-secondary/60 p-3"><Icon className="mb-2 h-4 w-4 text-primary"/><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>)}</div></Card>}
