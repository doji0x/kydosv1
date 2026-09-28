import React from 'react';
import { swapDisplay } from '@/lib/jupiterTrade';

export default function JupiterQuoteSummary({ trading, outputSymbol }) {
  const { order, outputDecimals, quote, expired } = trading;
  if (!order) return <p role="status" className="text-xs text-muted-foreground">{quote.isFetching ? 'Finding the best available route…' : 'Enter an amount to get a live quote.'}</p>;
  const impact = order.priceImpact;
  return <div className="space-y-2 rounded-xl bg-secondary/60 p-4 text-xs">
    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Estimated receive</span><span className="break-all text-right font-mono">{swapDisplay(order.outAmount, outputDecimals)} {outputSymbol}</span></div>
    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Minimum received</span><span className="break-all text-right font-mono">{swapDisplay(order.minimumOut, outputDecimals)} {outputSymbol}</span></div>
    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Price impact</span><span className={impact != null && Math.abs(impact) >= 5 ? 'text-destructive' : ''}>{impact == null ? 'Unavailable' : `${impact.toFixed(2)}%`}</span></div>
    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Jupiter fee</span><span>{(order.feeBps / 100).toFixed(2)}%</span></div>
    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Estimated network fee</span><span>{swapDisplay(String(order.networkFee), 9)} SOL</span></div>
    {order.rentFee > 0 && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Account rent</span><span>{swapDisplay(String(order.rentFee), 9)} SOL</span></div>}
    <p className="border-t border-border pt-2 text-muted-foreground">Route: {order.route}</p>
    <p role="status" className="text-muted-foreground">{quote.isFetching ? 'Refreshing quote…' : expired ? 'Quote expired — refresh before trading.' : 'Quotes refresh every 10 seconds. DEX fees are included in the quote; network fees and rent are additional.'}</p>
  </div>;
}