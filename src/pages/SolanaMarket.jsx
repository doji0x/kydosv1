import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import MarketHeader from '@/components/solana/MarketHeader';
import MarketChartSection from '@/components/solana/MarketChartSection';
import MarketStats from '@/components/solana/MarketStats';
import TradeDrawer from '@/components/solana/TradeDrawer';
import TradePanel from '@/components/solana/TradePanel';
import IndexedTradeSample from '@/components/solana/IndexedTradeSample';
import { Activity } from '@/lib/solana/Activity';
import useSolanaChartFeed from '@/hooks/useSolanaChartFeed';
import useMarketTrading from '@/hooks/useMarketTrading';
import { deriveMarketMetrics } from '@/lib/solana/marketMetrics';

export default function SolanaMarket() {
  const { mint } = useParams(), [tradeOpen, setTradeOpen] = useState(false);
  const feed = useSolanaChartFeed(mint);
  const trading = useMarketTrading(mint, feed.refreshLatest);
  const metrics = deriveMarketMetrics(feed.trades, feed.marketInfo);
  const recover = async () => { await trading.refresh(); await feed.refreshLatest(); };
  const openTrade = async () => { await trading.refresh(); setTradeOpen(true); };
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 pb-28">
    <MarketHeader mint={mint} market={trading.market} marketInfo={feed.marketInfo} metrics={metrics} network={feed.network}/>
    {feed.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Chart indexing: {feed.error}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5"><MarketChartSection feed={feed} metrics={metrics}/><MarketStats market={trading.market} balances={trading.balances} stale={trading.stale}/></div>
      <aside className="sticky top-20 hidden space-y-3 lg:block" aria-label="Trade token">
        {!trading.wallet.connected && <Button variant="outline" className="w-full" onClick={trading.connect}>Connect Phantom</Button>}
        {trading.loadError && <p role="alert" className="rounded-xl bg-secondary p-4 text-sm">{trading.loadError}</p>}
        {trading.market ? <TradePanel {...trading}/> : <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Waiting for on-chain reserves.</p>}
      </aside>
    </div>
    <section className="rounded-xl border border-border bg-card/70 p-4"><h2 className="font-semibold">Recent trades</h2><IndexedTradeSample trades={feed.trades.slice(-30).reverse()} network={feed.network}/></section>
    {trading.outcome && <p role="status" className="rounded-xl bg-secondary p-4 text-sm">{trading.outcome}</p>}
    <Activity activity={trading.activity} connection={trading.rpc.connection} onConfirmed={recover}/>
    <div className="sticky bottom-20 z-30 flex gap-2 rounded-xl border border-primary/20 bg-background/90 p-3 shadow-2xl backdrop-blur-xl lg:hidden">
      {!trading.wallet.connected && <Button variant="outline" className="flex-1" onClick={trading.connect}>Connect Phantom</Button>}
      <Button className="flex-1 gold-glow" disabled={trading.loading} onClick={openTrade}>Trade {trading.market?.symbol || feed.marketInfo?.symbol || 'token'}</Button>
    </div>
    <TradeDrawer open={tradeOpen} onOpenChange={setTradeOpen} trading={trading} symbol={feed.marketInfo?.symbol}/>
  </main>;
}