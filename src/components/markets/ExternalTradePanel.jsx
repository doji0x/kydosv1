import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useJupiterTrading from '@/hooks/useJupiterTrading';
import { swapDisplay } from '@/lib/jupiterTrade';
import JupiterQuoteSummary from '@/components/markets/JupiterQuoteSummary';
import JupiterTradeActivity from '@/components/markets/JupiterTradeActivity';

export default function ExternalTradePanel({ mint, symbol }) {
  const trading = useJupiterTrading(mint), [acceptedQuote, setAcceptedQuote] = useState('');
  const { auth, wallet, busy, side, counter, activity, order } = trading;
  const inputSymbol = side === 'buy' ? counter.symbol : symbol, outputSymbol = side === 'buy' ? symbol : counter.symbol;
  const highImpact = !!order && (order.priceImpact == null || Math.abs(order.priceImpact) >= 5);
  const acknowledged = !highImpact || acceptedQuote === order.requestId;
  const disabled = busy || activity.blocked;
  return <section className="mb-5 space-y-4 rounded-2xl border border-primary/25 bg-card p-5 sm:p-7" aria-label={`Trade ${symbol}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><ArrowDownUp className="h-4 w-4 text-primary"/>Trade {symbol}</h2><span className="text-xs text-muted-foreground">{symbol} / {counter.symbol} · Solana mainnet</span></div>
    {!auth.isAuthenticated ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Sign in and connect Phantom to buy or sell directly on Kydos.</p><Button asChild disabled={auth.isLoadingAuth}><Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}>Sign in to trade</Link></Button></div> : <>
      {!wallet.connected ? <Button type="button" disabled={trading.connecting} onClick={trading.connect}>{trading.connecting ? 'Connecting…' : 'Connect Phantom'}</Button> : <>
        <p className="break-all font-mono text-xs text-muted-foreground">Wallet: {trading.walletId}</p>
        <form className="space-y-4" onSubmit={event => { if (!acknowledged) event.preventDefault(); else trading.submit(event); }}>
          <div className="grid grid-cols-2 rounded-xl bg-secondary p-1">{['buy', 'sell'].map(value => <button key={value} type="button" disabled={disabled} onClick={() => trading.setSide(value)} aria-pressed={side === value} className={`rounded-lg py-2 text-sm font-semibold capitalize ${side === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{value} {symbol}</button>)}</div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm"><span>Pay with {inputSymbol}</span><Input inputMode="decimal" value={trading.amount} maxLength={280} disabled={disabled} onChange={event => trading.setAmount(event.target.value)} placeholder="0.00"/><span className="block break-all text-xs text-muted-foreground">Available: {trading.balances.isLoading ? 'Loading…' : swapDisplay(trading.available, trading.decimals)} {inputSymbol}</span></label>
            <label className="space-y-2 text-sm"><span>Slippage tolerance (%)</span><Input inputMode="decimal" value={trading.slippage} maxLength={5} disabled={disabled} onChange={event => trading.setSlippage(event.target.value)} placeholder="1"/><span className="block text-xs text-muted-foreground">Keep some SOL available for fees and account rent.</span></label></div>
          <JupiterQuoteSummary trading={trading} outputSymbol={outputSymbol}/>
          {highImpact && <label className="flex items-start gap-2 text-xs text-destructive"><input type="checkbox" className="mt-0.5" disabled={disabled} checked={acknowledged} onChange={event => setAcceptedQuote(event.target.checked ? order.requestId : '')}/>{order.priceImpact == null ? 'Price impact is unavailable. I understand this risk and want to continue.' : 'High price impact: I understand this trade may incur a significant loss.'}</label>}
          {trading.error && <p role="alert" className="text-sm text-destructive">{trading.error}</p>}
          <div className="flex flex-wrap gap-3"><Button type="submit" className="flex-1" disabled={!trading.ready || activity.blocked || !acknowledged}>{busy ? 'Approving / confirming…' : trading.quote.isFetching ? 'Getting quote…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}</Button><Button type="button" variant="outline" disabled={busy || trading.balances.isFetching || trading.quote.isFetching} onClick={() => { trading.balances.refetch(); if (trading.raw && !trading.inputError) trading.quote.refetch(); }}>Refresh</Button></div>
        </form>
      </>}
      {trading.message && <p role="status" className="text-sm">{trading.message}</p>}
      <JupiterTradeActivity activity={activity} connection={trading.connection} onConfirmed={trading.refresh}/>
    </>}
    <p className="text-xs leading-relaxed text-muted-foreground">Swaps use Jupiter liquidity routes and require your wallet approval. No Kydos trading fee is added. A listed token may be untradeable if liquidity or a supported route is unavailable.</p>
  </section>;
}