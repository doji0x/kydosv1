import React, { useEffect, useRef, useState } from 'react';
import useMarketCandles from '@/hooks/useMarketCandles';
import { sparklinePath } from '@/lib/marketCandles';

export default function MarketSparkline({ mint, symbol }) {
  const container = useRef(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!window.IntersectionObserver) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } });
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  const feed = useMarketCandles(mint, '1h', { enabled: visible, compact: true });
  const spark = sparklinePath(feed.candles, feed.now);
  return <div ref={container} className="my-3 h-10" title="Hourly closing prices, up to the past 24 hours">
    {spark ? <svg role="img" aria-label={`${symbol} recent price history${feed.stale ? ', delayed' : ''}`} viewBox="0 0 160 40" preserveAspectRatio="none" className={`h-10 w-full ${feed.stale ? 'text-amber-400' : spark.rising ? 'text-emerald-400' : 'text-rose-400'}`}><path d={spark.path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/></svg> : <span className="flex h-10 items-center text-[10px] text-muted-foreground">{feed.error ? 'History unavailable' : feed.isPending ? 'Loading history…' : 'No recent trades'}</span>}
  </div>;
}
