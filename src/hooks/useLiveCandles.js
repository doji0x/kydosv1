// Owns the live candle series for one token/interval.
//
// One stream runs per token and survives interval switches: sub-minute bars are rolled
// entirely from streamed swaps, while minute+ bars load from the persisted store and then
// keep updating from the same stream.
import { useEffect, useRef, useState } from "react";
import { openRhStream } from "@/lib/rhStream";
import { fetchRhCandles, fetchRhStream } from "@/lib/rhApi";

// How far back each sub-minute view reads real swaps on first load (~10 blocks/sec).
const BOOTSTRAP_BLOCKS = { "1s": 1800, "5s": 4500, "15s": 6000 };
import { INTERVAL_MS, isClientInterval, applyTrade, fillIdle, seedSeries } from "@/lib/rollCandles";

export default function useLiveCandles(address, timeframe) {
  const ms = INTERVAL_MS[timeframe];
  const [candles, setCandles] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [price, setPrice] = useState(null);
  const [drain, setDrain] = useState(0);
  const pending = useRef([]);
  const priceRef = useRef(null);

  // The stream itself — tied to the token, not the interval.
  useEffect(() => {
    pending.current = [];
    priceRef.current = null;
    setPrice(null);
    const stop = openRhStream(
      address,
      (tick) => {
        if (tick.price_usd) {
          priceRef.current = tick.price_usd;
          setPrice(tick.price_usd);
        }
        if (tick.trades?.length) pending.current.push(...tick.trades);
        setDrain((d) => d + 1);
      },
      setStatus
    );
    return stop;
  }, [address]);

  // Base series for the selected interval.
  useEffect(() => {
    let alive = true;
    setCandles(null);
    if (isClientInterval(timeframe)) {
      // Bootstrap sub-minute bars from real recent swaps so the chart opens with genuine
      // history rather than a flat placeholder.
      fetchRhStream(address, 0, BOOTSTRAP_BLOCKS[timeframe] || 1800)
        .then((d) => {
          if (!alive) return;
          let bars = [];
          for (const t of d?.trades || []) bars = applyTrade(bars, t, ms);
          if (!bars.length) bars = seedSeries(d?.price_usd || priceRef.current, ms, 20);
          setCandles(bars.length ? fillIdle(bars, ms) : bars);
        })
        .catch(() => {
          if (alive) setCandles(priceRef.current ? seedSeries(priceRef.current, ms) : null);
        });
    } else {
      fetchRhCandles(address, timeframe, 200)
        .then(async (d) => {
          if (!alive) return;
          const stored = d?.candles?.map((c) => ({ ...c })) || [];
          if (stored.length) return setCandles(stored);
          // Nothing persisted yet — build what history we can from recent on-chain swaps.
          const live = await fetchRhStream(address, 0, 6000).catch(() => null);
          if (!alive) return;
          let bars = [];
          for (const t of live?.trades || []) bars = applyTrade(bars, t, ms);
          setCandles(bars);
        })
        .catch(() => alive && setCandles([]));
    }
    return () => {
      alive = false;
    };
  }, [address, timeframe, ms]);

  // A sub-minute view opened before the first tick seeds as soon as a price arrives.
  useEffect(() => {
    if (!isClientInterval(timeframe) || candles !== null || !price) return;
    setCandles(seedSeries(price, ms));
  }, [timeframe, candles, price, ms]);

  // Fold newly streamed swaps into the series.
  useEffect(() => {
    if (!pending.current.length) return;
    const batch = pending.current;
    pending.current = [];
    setCandles((prev) => {
      if (!prev) return prev;
      let next = prev;
      for (const t of batch) next = applyTrade(next, t, ms);
      return next;
    });
  }, [drain, ms]);

  // Keep sub-minute bars advancing while the market is quiet.
  useEffect(() => {
    if (!isClientInterval(timeframe)) return;
    const id = window.setInterval(() => {
      setCandles((prev) => (prev?.length ? fillIdle(prev, ms) : prev));
    }, Math.max(ms, 1000));
    return () => window.clearInterval(id);
  }, [timeframe, ms]);

  return { candles, status, price };
}