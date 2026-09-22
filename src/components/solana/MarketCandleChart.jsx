import React, { useEffect, useRef, useState } from 'react';
import { ColorType, CrosshairMode, createChart } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/solana/marketMetrics';
import { canUpdateLastCandle } from '@/lib/solana/candles';
const priceBar = ({ volume, ...bar }) => bar;
const volumeBar = bar => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? '#22c55e66' : '#ef444466' });
export default function MarketCandleChart({ candles, timeframe }) {
  const container = useRef(null), api = useRef(null), previous = useRef([]), frame = useRef(null), following = useRef(true), applying = useRef(false);
  const [legend, setLegend] = useState(null), [follow, setFollow] = useState(true);
  useEffect(() => {
    const chart = createChart(container.current, { autoSize: true, height: 390,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8f8f8f' },
      grid: { vertLines: { color: '#1b1b1b' }, horzLines: { color: '#1b1b1b' } }, crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#292929', scaleMargins: { top: 0.08, bottom: 0.28 } },
      timeScale: { borderColor: '#292929', timeVisible: true, secondsVisible: false }, localization: { priceFormatter: formatPrice } });
    const price = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444', priceFormat: { type: 'custom', formatter: formatPrice, minMove: 0.000000000001 } });
    const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    chart.subscribeCrosshairMove(event => setLegend(event.seriesData.get(price) || null));
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (!range || applying.current) return;
      following.current = range.to >= previous.current.length - 1; setFollow(following.current);
    });
    api.current = { chart, price, volume };
    return () => { chart.remove(); api.current = null; previous.current = []; frame.current = null; };
  }, []);
  useEffect(() => {
    if (!api.current) return;
    const { chart, price, volume } = api.current, reset = frame.current !== timeframe;
    const range = chart.timeScale().getVisibleRange(), wasFollowing = following.current; applying.current = true;
    if (!reset && canUpdateLastCandle(previous.current, candles)) {
      for (const bar of candles.slice(previous.current.length - 1)) { price.update(priceBar(bar)); volume.update(volumeBar(bar)); }
    } else { price.setData(candles.map(priceBar)); volume.setData(candles.map(volumeBar)); }
    if (reset) { chart.timeScale().fitContent(); following.current = true; setFollow(true); setLegend(null); }
    else if (wasFollowing) chart.timeScale().scrollToRealTime(); else if (range) chart.timeScale().setVisibleRange(range);
    previous.current = candles; frame.current = timeframe; applying.current = false;
  }, [candles, timeframe]);
  const bar = legend || candles.at(-1);
  const goLive = () => { following.current = true; setFollow(true); api.current?.chart.timeScale().scrollToRealTime(); };
  return <div><div className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] text-muted-foreground"><span className="font-mono">{bar && `O ${formatPrice(bar.open)} · H ${formatPrice(bar.high)} · L ${formatPrice(bar.low)} · C ${formatPrice(bar.close)} SOL`}</span><Button size="sm" variant="ghost" onClick={goLive} disabled={follow}>Follow latest</Button></div>
    <div ref={container} className="h-[390px] w-full" aria-label="Token candlestick and SOL volume chart"/>
    <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="block px-4 py-2 text-right text-[10px] text-muted-foreground underline">Charts by TradingView Lightweight Charts™</a>
  </div>;
}
