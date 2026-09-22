import React from 'react';
import { Card } from '@/components/ui/card';
import { formatAmount } from '@/lib/solana/market';
export default function MarketStats({ market, balances, stale }) {
  if (!market) return null;
  const allocation = Number(market.curveTokenAllocation), remaining = Number(market.tokenReserve);
  const progress = allocation > 0 ? Math.max(0, Math.min(100, (1 - remaining / allocation) * 100)) : 0;
  const rows = [['Curve tokens remaining', formatAmount(market.tokenReserve, market.decimals)], ['Real SOL reserve', `${formatAmount(market.realSolReserve, 9)} SOL`], ['Curve status', market.graduated ? 'Ready to migrate' : 'Bonding'], ['Reserve snapshot', `${market.slot}${stale ? ' · stale' : ''}`]];
  return <div className="grid grid-cols-2 gap-3">
    <Card className="col-span-2 bg-card/70 p-4"><div className="flex justify-between text-sm"><span>Curve inventory sold</span><span>{progress.toFixed(1)}%</span></div><progress className="mt-2 h-2 w-full accent-primary" max={100} value={progress} aria-label="Curve inventory sold"/><p className="mt-2 text-xs text-muted-foreground">Graduation occurs when curve inventory is sold. Meteora trading starts after a verified migration.</p></Card>
    {rows.map(([label, value]) => <Card key={label} className="bg-card/70 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p></Card>)}
    {balances && <Card className="col-span-2 bg-card/70 p-4"><p className="text-xs text-muted-foreground">Your confirmed balance</p><p className="mt-1 font-mono text-sm font-semibold">{formatAmount(balances.sol, 9)} SOL · {formatAmount(balances.tokens, market.decimals)} {market.symbol}</p></Card>}
  </div>;
}
