import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

export default function TokenPriceChart({ series }) {
  const container = useRef(null);
  useEffect(() => {
    const chart = createChart(container.current, {
      height: 360, autoSize: true, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8f8f8f' },
      grid: { vertLines: { color: '#202020' }, horzLines: { color: '#202020' } },
      rightPriceScale: { borderColor: '#2b2b2b' }, timeScale: { borderColor: '#2b2b2b', timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal }, localization: { priceFormatter: value => value.toExponential(6) },
    });
    const line = chart.addLineSeries({ color: '#f2b429', lineWidth: 2, priceLineVisible: false });
    line.setData(series.map(point => ({ time: point.t, value: point.price })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series]);
  return <div ref={container} className="h-[360px] w-full" aria-label="SOL price per token over time" />;
}