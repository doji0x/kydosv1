// Owns the candle series for one token/interval.
//
// The chart paints as soon as the store answers — indexed bars plus indexed swaps rolled into
// bars — and never waits on the chain. The on-chain walk toward launch then runs in the
// background, folding each scanned page into the series as it lands and writing what it
// decoded back to the store (persistScan) so the walk happens once per token, not per view.
//
// Sub-minute bars are never persisted and would be tens of thousands of bars a day, so those
// intervals only reach back over a short recent window.
import { useCallback, useEffect, useRef, useState } from "react";
import { openRhStream } from "@/lib/rhStream";
import { fetchAllRhCandles, fetchAllRhTrades } from "@/lib/rhApi";
import { INTERVAL_MS, isClientInterval, applyTrade, fillGaps, fillIdle, seedSeries } from "@/lib/rollCandles";
import { tradeTime } from "@/lib/rollCandles";
import { mergeSeries } from "@/lib/chart/mergeBars";

// Assembled history is gap-filled and advanced to now, so the line is continuous end to end.
const present = (bars, ms) => fillIdle(fillGaps(bars, ms), ms);

const rollTrades = (trades, ms) => {
  const sorted = trades
    .slice()
    .sort((a, b) => tradeTime(a) - tradeTime(b) || (a.block_number || 0) - (b.block_number || 0) || (a.log_index || 0) - (b.log_index || 0));
  let bars = [];
  const seen = new Set();
  for (const t of sorted) {
    const key = t.uid || (t.tx_hash && t.log_index != null ? `${t.tx_hash}-${t.log_index}` : null);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    bars = applyTrade(bars, t, ms);
  }
  return bars;
};

export default function useLiveCandles(address, timeframe) {
  const ms = INTERVAL_MS[timeframe];
  const [candles, setCandles] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [price, setPrice] = useState(null);
  const [drain, setDrain] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [progress, setProgress] = useState(null);
  const pending = useRef([]);
  const priceRef = useRef(null);
  const ready = useRef(false); // true once something is on screen
  const oldestBlock = useRef(0);
  const busy = useRef(false);

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

  // Paint the complete canonical store. Historical chain reads happen only in the server
  // indexer, never once per visitor.
  useEffect(() => {
    let alive = true;
    ready.current = false;
    setCandles(null);
    setHasOlder(false);
    setLoadingOlder(true);
    setProgress({ phase: "stored" });
    oldestBlock.current = 0;
    busy.current = false;

    (async () => {
      const [stored, storedTrades] = await Promise.all([
        isClientInterval(timeframe) ? Promise.resolve([]) : fetchAllRhCandles(address, timeframe),
        fetchAllRhTrades(address),
      ]);
      if (!alive) return;
      const fromStore = mergeSeries(stored, rollTrades(storedTrades, ms));
      ready.current = true;
      setCandles(present(fromStore.length ? fromStore : priceRef.current ? seedSeries(priceRef.current, ms) : [] , ms));
      setProgress(null);
      setLoadingOlder(false);
    })();

    return () => { alive = false; };
  }, [address, timeframe, ms]);

  // Fold streamed swaps in once something is on screen (they queue up until then).
  useEffect(() => {
    if (!ready.current || !pending.current.length) return;
    const batch = pending.current;
    pending.current = [];
    setCandles((prev) => {
      if (!prev) return prev;
      let next = prev;
      for (const t of batch) next = applyTrade(next, t, ms);
      return next;
    });
  }, [drain, ms]);

  // A first price arriving before any history still deserves a chart.
  useEffect(() => {
    if (!price || ready.current) return;
    ready.current = true;
    setCandles((prev) => (prev?.length ? prev : seedSeries(price, ms)));
    setProgress(null);
    setLoadingOlder(false);
  }, [price, ms]);

  // Keep sub-minute bars advancing while the market is quiet.
  useEffect(() => {
    if (!isClientInterval(timeframe)) return;
    const id = window.setInterval(() => {
      setCandles((prev) => (prev?.length ? fillIdle(prev, ms) : prev));
    }, Math.max(ms, 1000));
    return () => window.clearInterval(id);
  }, [timeframe, ms]);

  const loadOlder = useCallback(() => {}, []);

  return { candles, status, price, progress, loadOlder, loadingOlder, hasOlder };
}