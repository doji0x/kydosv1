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
import { fetchRhCandles, fetchRhStream, fetchRhTrades } from "@/lib/rhApi";
import { INTERVAL_MS, isClientInterval, applyTrade, fillIdle, seedSeries } from "@/lib/rollCandles";
import { mergeSeries } from "@/lib/chart/mergeBars";
import { backfillSwaps } from "@/lib/chart/backfill";
import { persistScan } from "@/lib/chart/persistBackfill";

const STORED_LIMIT = 500;
const STORED_TRADES = 400;
const SUB_MINUTE_MAX_AGE_MS = 30 * 60 * 1000;
const HISTORY_BUDGET_MS = 45_000;

const rollTrades = (trades, ms) => {
  const sorted = trades
    .slice()
    .sort((a, b) => (a.block_time || 0) - (b.block_time || 0) || (a.block_number || 0) - (b.block_number || 0));
  let bars = [];
  for (const t of sorted) bars = applyTrade(bars, t, ms);
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

  // Paint from the store, then extend backwards off the chain in the background.
  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    ready.current = false;
    setCandles(null);
    setHasOlder(true);
    setLoadingOlder(true);
    setProgress({ phase: "stored" });
    oldestBlock.current = 0;
    busy.current = false;

    // Folds an older batch of bars under whatever is already on screen.
    const foldOlder = (bars) => {
      if (!alive || !bars.length) return;
      setCandles((prev) => fillIdle(mergeSeries(bars, prev || []), ms));
    };

    (async () => {
      // 1. Bars the indexer already rolled, plus indexed swaps for buckets it hasn't sealed.
      const [stored, storedTrades] = await Promise.all([
        isClientInterval(timeframe)
          ? Promise.resolve([])
          : fetchRhCandles(address, timeframe, STORED_LIMIT).then((d) => d?.candles || []).catch(() => []),
        fetchRhTrades(address, STORED_TRADES).then((d) => d?.trades || []).catch(() => []),
      ]);
      if (!alive) return;

      const blocks = storedTrades.map((t) => t.block_number || 0).filter(Boolean);
      const newestStored = blocks.length ? Math.max(...blocks) : 0;
      const oldestStored = blocks.length ? Math.min(...blocks) : 0;
      const fromStore = mergeSeries(stored, rollTrades(storedTrades, ms));

      // Show it now. Everything after this point only adds to what the user already sees.
      if (fromStore.length || priceRef.current) {
        ready.current = true;
        setCandles(fillIdle(fromStore.length ? fromStore : seedSeries(priceRef.current, ms), ms));
        setProgress(null);
        setLoadingOlder(false);
      } else {
        setProgress({ phase: "onchain", stored: 0 });
      }
      oldestBlock.current = oldestStored || 0;

      // 2. Walk the chain for whatever the store hasn't reached, page by page.
      const head = await fetchRhStream(address, 0, 0).then((d) => d?.head_block || 0).catch(() => 0);
      if (!alive || !head) return;

      const scan = await backfillSwaps({
        address,
        headBlock: head,
        minBlock: newestStored,
        maxAgeMs: isClientInterval(timeframe) ? SUB_MINUTE_MAX_AGE_MS : 0,
        budgetMs: HISTORY_BUDGET_MS,
        alive: isAlive,
        onProgress: (p) => alive && !ready.current && setProgress({ phase: "onchain", ...p }),
        onBatch: (all) => foldOlder(rollTrades(all, ms)),
      });
      if (!alive) return;

      const scanned = rollTrades(scan.trades, ms);
      if (!ready.current) {
        let series = mergeSeries(fromStore, scanned);
        if (!series.length && priceRef.current) series = seedSeries(priceRef.current, ms);
        ready.current = true;
        setCandles(fillIdle(series, ms));
        setProgress(null);
        setLoadingOlder(false);
      }

      oldestBlock.current = Math.min(...[scan.oldestBlock, oldestStored].filter(Boolean), Infinity);
      const atLaunch = scan.reachedStart && !scan.stoppedAtMin;
      setHasOlder(!atLaunch && Number.isFinite(oldestBlock.current) && oldestBlock.current > 1);

      // Hand the scan to the store so the next visitor reads it instead of re-scanning.
      if (scan.trades.length) persistScan(address, scan.trades, scanned, timeframe);
    })();

    return () => {
      alive = false;
    };
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

  // Continue past the budget cut-off when the user pans back to the oldest loaded bar.
  const loadOlder = useCallback(async () => {
    if (busy.current || !hasOlder || !ready.current || !oldestBlock.current) return;
    busy.current = true;
    setLoadingOlder(true);
    try {
      const to = oldestBlock.current - 1;
      if (to <= 0) return setHasOlder(false);
      const scan = await backfillSwaps({
        address,
        headBlock: to,
        maxAgeMs: isClientInterval(timeframe) ? SUB_MINUTE_MAX_AGE_MS : 0,
        budgetMs: HISTORY_BUDGET_MS,
        onProgress: (p) => setProgress({ phase: "older", ...p }),
        onBatch: (all) => setCandles((prev) => mergeSeries(rollTrades(all, ms), prev || [])),
      });
      oldestBlock.current = scan.oldestBlock;
      setHasOlder(!scan.reachedStart && !!scan.oldestBlock);
      // Panning back fills the store too, so this history is only ever read once.
      if (scan.trades.length) persistScan(address, scan.trades, rollTrades(scan.trades, ms), timeframe);
    } finally {
      busy.current = false;
      setLoadingOlder(false);
      setProgress(null);
    }
  }, [address, timeframe, ms, hasOlder]);

  return { candles, status, price, progress, loadOlder, loadingOlder, hasOlder };
}