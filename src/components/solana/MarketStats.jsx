import React from 'react';
import { Card } from '@/components/ui/card';
import { formatAmount } from '@/lib/solana/market';
import { formatCompact } from '@/lib/solana/marketMetrics';

export default function MarketStats({ market, balances, stale, metrics }) {
  const rows = [
    ['Market cap (USD)', formatCompact(metrics.marketCapUsd, '$')],
    ['Market cap (SOL)', formatCompact(metrics.marketCapSol, '', ' SOL')],
  ];
  if (market) rows.push(['Curve tokens', formatAmount(market.tokenReserve, market.decimals)], ['SOL reserve', `${formatAmount(market.realSolReserve, 9)} SOL`], ['Curve status', market.graduated ? 'Complete · awaiting migration' : 'Bonding'], ['Snapshot', `${market.slot}${stale ? ' · stale' : ''}`]);
  return <div className="grid grid-cols-2 gap-3">{rows.map(([label, value]) => <Card key={label} className="bg-card/70 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p></Card>)}
    {balances && market && <Card className="col-span-2 bg-card/70 p-4"><p className="text-xs text-muted-foreground">Your confirmed balance</p><p className="mt-1 font-mono text-sm font-semibold">{formatAmount(balances.sol, 9)} SOL · {formatAmount(balances.tokens, market.decimals)} {market.symbol}</p></Card>}
  </div>;
}