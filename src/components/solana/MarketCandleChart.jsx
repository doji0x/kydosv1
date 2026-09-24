import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, CrosshairMode, createChart } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { formatPrice as formatSolPrice } from '@/lib/solana/marketMetrics';
import { formatPrice as formatUsdPrice, formatCompact } from '@/lib/markets';
import { canUpdateLastCandle } from '@/lib/solana/candles';
const priceBar = ({ volume, ...bar }) => bar;
const lineBar = bar => ({ time: bar.time, value: bar.close });
const volumeBar = bar => bar.volume == null ? { time: bar.time } : ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? '#22c55e66' : '#ef444466' });

export default function MarketCandleChart({ candles, timeframe, seriesKey = timeframe, currency = 'SOL', volumeCurrency = 'SOL', variant = 'candles', onLoadOlder, canLoadOlder = false, livePrice = null }) {
  const container = useRef(null), api = useRef(null), previous = useRef([]), frame = useRef(null);
  const following = useRef(true), applying = useRef(false), history = useRef({}), bars = useRef(new Map());
  history.current = { onLoadOlder, canLoadOlder };
  bars.current = new Map(candles.map(bar => [bar.time, bar]));
  const [legend, setLegend] = useState(null), [follow, setFollow] = useState(true);
  const formatPrice = useMemo(() => currency === 'USD' ? formatUsdPrice : formatSolPrice, [currency]);
  useEffect(() => {
    const chart = createChart(container.current, {
      autoSize: true, height: 390,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8f8f8f' },
      grid: { vertLines: { color: '#1b1b1b' }, horzLines: { color: '#1b1b1b' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#292929', scaleMargins: { top: 0.08, bottom: 0.28 } },
      timeScale: { borderColor: '#292929', timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: formatPrice },
    });
    const priceFormat = { type: 'custom', formatter: formatPrice, minMove: 0.000000000001 };
    const price = variant === 'line'
      ? chart.addLineSeries({ color: '#f2b429', lineWidth: 2, priceFormat })
      : chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444', priceFormat });
    const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    chart.subscribeCrosshairMove(event => setLegend(event.time == null ? null : bars.current.get(event.time) || null));
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (!range || applying.current) return;
      following.current = range.to >= previous.current.length - 1;
      setFollow(following.current);
      // Initial fit must not consume every history page. Load only after panning away from the latest bar.
      if (!following.current && range.from < 15 && history.current.canLoadOlder) history.current.onLoadOlder?.();
    });
    api.current = { chart, price, volume };
    return () => { chart.remove(); api.current = null; previous.current = []; frame.current = null; };
  }, [formatPrice, variant]);
  useEffect(() => {
    if (!api.current) return;
    const { chart, price, volume } = api.current, identity = `${seriesKey}:${timeframe}:${currency}:${variant}`, reset = frame.current !== identity;
    const range = chart.timeScale().getVisibleRange(), wasFollowing = following.current;
    const toPrice = variant === 'line' ? lineBar : priceBar;
    applying.current = true;
    try {
      if (!reset && canUpdateLastCandle(previous.current, candles)) {
        for (const bar of candles.slice(previous.current.length - 1)) { price.update(toPrice(bar)); volume.update(volumeBar(bar)); }
      } else { price.setData(candles.map(toPrice)); volume.setData(candles.map(volumeBar)); }
      previous.current = candles; frame.current = identity;
      if (reset) { chart.timeScale().fitContent(); following.current = true; setFollow(true); setLegend(null); }
      else if (wasFollowing) chart.timeScale().scrollToRealTime();
      else if (range) chart.timeScale().setVisibleRange(range);
    } finally { applying.current = false; }
  }, [candles, timeframe, seriesKey, currency, variant, formatPrice]);
  useEffect(() => {
    if (!api.current || !Number.isFinite(livePrice) || livePrice <= 0) return;
    const series = api.current.price;
    const line = series.createPriceLine({ price: livePrice, color: '#f2b429', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Jupiter' });
    return () => { if (api.current?.price === series) series.removePriceLine(line); };
  }, [livePrice, variant, formatPrice, seriesKey]);
  const bar = legend ? bars.current.get(legend.time) || candles.at(-1) : candles.at(-1);
  const goLive = () => { following.current = true; setFollow(true); api.current?.chart.timeScale().scrollToRealTime(); };
  return <div>
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] text-muted-foreground">
      <span className="font-mono">{bar && `O ${formatPrice(bar.open)} · H ${formatPrice(bar.high)} · L ${formatPrice(bar.low)} · C ${formatPrice(bar.close)} ${currency} · Vol ${formatCompact(bar.volume, volumeCurrency === 'USD')}${volumeCurrency === 'USD' ? '' : ` ${volumeCurrency}`}`}</span>
      <Button size="sm" variant="ghost" onClick={goLive} disabled={follow}>Follow latest</Button>
    </div>
    <div ref={container} className="h-[330px] w-full sm:h-[390px]" role="img" aria-label={`Interactive ${currency} price chart${candles.some(item => item.volume != null) ? ` and ${volumeCurrency} volume` : ', volume unavailable'}. Drag to pan and scroll or pinch to zoom.`}/>
    <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="block px-4 py-2 text-right text-[10px] text-muted-foreground underline">Charts by TradingView Lightweight Charts™</a>
  </div>;
}