// Owns the candle series for one token/interval.
//
// History is assembled from the store first — indexed bars, then indexed swaps rolled into
// bars — and the chain is scanned only for blocks the store hasn't reached yet. Whatever that
// scan decodes is written back (persistScan), so the walk toward launch happens once for a
// token rather than on every chart view. All three sources are deduped by bucket.
//
// Sub-minute intervals are never persisted, and scanning launch-to-now block by block is far
// beyond the RPC budget, so those cap out at a recent age window.
import { useCallback, useEffect, useRef, useState } from "react";
import { openRhStream } from "@/lib/rhStream";
import { fetchRhCandles, fetchRhStream, fetchRhTrades } from "@/lib/rhApi";
import { INTERVAL_MS, isClientInterval, applyTrade, fillIdle, seedSeries } from "@/lib/rollCandles";
import { mergeSeries } from "@/lib/chart/mergeBars";
import { backfillSwaps } from "@/lib/chart/backfill";
import { persistScan } from "@/lib/chart/persistBackfill";

const STORED_LIMIT = 500;
const STORED_TRADES = 200;
const SUB_MINUTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
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
  const ready = useRef(false); // true once the assembled history is on screen
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

  // Assemble the full history for the selected interval, then render it in one go.
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

    (async () => {
      // 1. Bars the indexer already rolled for this interval.
      const stored = isClientInterval(timeframe)
        ? []
        : await fetchRhCandles(address, timeframe, STORED_LIMIT)
            .then((d) => d?.candles || [])
            .catch(() => []);
      if (!alive) return;

      // 2. Indexed swaps — they cover buckets the roller may not have sealed yet, and they
      //    tell us how far the store has actually got, which bounds the chain scan below.
      const storedTrades = await fetchRhTrades(address, STORED_TRADES)
        .then((d) => d?.trades || [])
        .catch(() => []);
      if (!alive) return;

      const blocks = storedTrades.map((t) => t.block_number || 0).filter(Boolean);
      const newestStored = blocks.length ? Math.max(...blocks) : 0;
      const oldestStored = blocks.length ? Math.min(...blocks) : 0;
      const fromStore = mergeSeries(stored, rollTrades(storedTrades, ms));
      setProgress({ phase: "onchain", stored: fromStore.length });

      // 3. Scan only what the store hasn't reached. With history already persisted this is
      //    the thin live gap; on a token's first ever view it is the full walk to launch.
      const head = await fetchRhStream(address, 0, 0)
        .then((d) => d?.head_block || 0)
        .catch(() => 0);
      if (!alive) return;

      const scan = head
        ? await backfillSwaps({
            address,
            headBlock: head,
            minBlock: newestStored,
            maxAgeMs: isClientInterval(timeframe) ? SUB_MINUTE_MAX_AGE_MS : 0,
            budgetMs: HISTORY_BUDGET_MS,
            alive: isAlive,
            onProgress: (p) => alive && setProgress({ phase: "onchain", stored: fromStore.length, ...p }),
          })
        : { trades: [], oldestBlock: 0, reachedStart: false, stoppedAtMin: false };
      if (!alive) return;

      const scanned = rollTrades(scan.trades, ms);
      let series = mergeSeries(fromStore, scanned);
      if (!series.length && priceRef.current) series = seedSeries(priceRef.current, ms);

      // Paging back continues below whichever source reaches furthest into the past.
      oldestBlock.current = Math.min(...[scan.oldestBlock, oldestStored].filter(Boolean), Infinity);
      const atLaunch = scan.reachedStart && !scan.stoppedAtMin;
      setHasOlder(!atLaunch && Number.isFinite(oldestBlock.current) && oldestBlock.current > 1);
      ready.current = true;
      setCandles(fillIdle(series, ms));
      setProgress(null);
      setLoadingOlder(false);

      // Hand the scan to the store so the next visitor reads it instead of re-scanning.
      if (scan.trades.length) persistScan(address, scan.trades, scanned, timeframe);
    })();

    return () => {
      alive = false;
    };
  }, [address, timeframe, ms]);

  // Fold streamed swaps in once the history is on screen (they queue up until then).
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
      });
      oldestBlock.current = scan.oldestBlock;
      setHasOlder(!scan.reachedStart && !!scan.oldestBlock);
      const older = rollTrades(scan.trades, ms);
      if (older.length) setCandles((prev) => mergeSeries(older, prev || []));
      // Panning back fills the store too, so this history is only ever read once.
      if (scan.trades.length) persistScan(address, scan.trades, older, timeframe);
    } finally {
      busy.current = false;
      setLoadingOlder(false);
      setProgress(null);
    }
  }, [address, timeframe, ms, hasOlder]);

  return { candles, status, price, progress, loadOlder, loadingOlder, hasOlder };
}