import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import MarketHeader from '@/components/solana/MarketHeader';
import MarketChartSection from '@/components/solana/MarketChartSection';
import MarketStats from '@/components/solana/MarketStats';
import TradeDrawer from '@/components/solana/TradeDrawer';
import { Activity } from '@/lib/solana/Activity';
import useSolanaChartFeed from '@/hooks/useSolanaChartFeed';
import useMarketTrading from '@/hooks/useMarketTrading';
import { deriveMarketMetrics } from '@/lib/solana/marketMetrics';

export default function SolanaMarket() {
  const { mint } = useParams(), [tradeOpen, setTradeOpen] = useState(false);
  const feed = useSolanaChartFeed(mint, tradeOpen);
  const trading = useMarketTrading(mint, feed.refreshLatest);
  const metrics = deriveMarketMetrics(feed.trades, feed.marketInfo);
  const recover = async () => { await trading.refresh(); await feed.refreshLatest(); };
  const openTrade = async () => { await trading.refresh(); setTradeOpen(true); };
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 pb-28">
    <MarketHeader mint={mint} market={trading.market} marketInfo={feed.marketInfo} metrics={metrics}/>
    {feed.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Chart indexing: {feed.error}</p>}
    <MarketChartSection feed={feed} metrics={metrics}/>
    <MarketStats market={trading.market} balances={trading.balances} stale={trading.stale} metrics={metrics}/> 
    {trading.outcome && <p role="status" className="rounded-xl bg-secondary p-4 text-sm">{trading.outcome}</p>}
    <Activity activity={trading.activity} connection={trading.rpc.connection} onConfirmed={recover}/>
    <div className="sticky bottom-20 z-30 flex gap-2 rounded-xl border border-primary/20 bg-background/90 p-3 shadow-2xl backdrop-blur-xl">
      {!trading.wallet.connected && <Button variant="outline" className="flex-1" onClick={trading.connect}>Connect Phantom</Button>}
      <Button className="flex-1 gold-glow" disabled={trading.loading} onClick={openTrade}>Trade {trading.market?.symbol || feed.marketInfo?.symbol || 'token'}</Button>
    </div>
    <TradeDrawer open={tradeOpen} onOpenChange={setTradeOpen} trading={trading} symbol={feed.marketInfo?.symbol}/>
  </main>;
}