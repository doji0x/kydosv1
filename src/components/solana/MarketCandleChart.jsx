import React, { useEffect, useRef } from 'react';
import { ColorType, CrosshairMode, createChart } from 'lightweight-charts';

export default function MarketCandleChart({ candles }) {
  const container = useRef(null), chartRef = useRef(null), candleRef = useRef(null), volumeRef = useRef(null), initialized = useRef(false);
  useEffect(() => {
    const chart = createChart(container.current, { autoSize: true, height: 430,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8f8f8f' },
      grid: { vertLines: { color: '#1b1b1b' }, horzLines: { color: '#1b1b1b' } }, crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#292929', scaleMargins: { top: 0.08, bottom: 0.28 } },
      timeScale: { borderColor: '#292929', timeVisible: true, secondsVisible: false }, localization: { priceFormatter: value => value.toExponential(6) } });
    candleRef.current = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444', priceLineColor: '#f2b429' });
    volumeRef.current = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false });
    volumeRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } }); chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; initialized.current = false; };
  }, []);
  useEffect(() => {
    if (!chartRef.current) return;
    const range = chartRef.current.timeScale().getVisibleRange();
    candleRef.current.setData(candles.map(({ volume, ...candle }) => candle));
    volumeRef.current.setData(candles.map(candle => ({ time: candle.time, value: candle.volume, color: candle.close >= candle.open ? '#22c55e66' : '#ef444466' })));
    if (!initialized.current) { chartRef.current.timeScale().fitContent(); initialized.current = true; }
    else if (range) chartRef.current.timeScale().setVisibleRange(range);
  }, [candles]);
  return <div ref={container} className="h-[430px] w-full" aria-label="Live token candlestick and SOL volume chart" />;
}