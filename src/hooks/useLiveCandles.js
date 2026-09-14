// Owns the live candle series for one token/interval.
//
// One stream runs per token and survives interval switches: sub-minute bars are rolled
// entirely from streamed swaps, while minute+ bars load from the persisted store and then
// keep updating from the same stream.
//
// History arrives on a slow path (an on-chain log scan can take 20s), so the series is
// never blocked on it: the chart draws as soon as a price tick lands, and the scanned
// history is merged in underneath the live bars once it resolves.
import { useCallback, useEffect, useRef, useState } from "react";
import { openRhStream } from "@/lib/rhStream";
import { fetchRhCandles, fetchRhStream, fetchRhStreamBefore } from "@/lib/rhApi";
import { INTERVAL_MS, isClientInterval, applyTrade, fillIdle, seedSeries } from "@/lib/rollCandles";
import { prependBars } from "@/lib/chart/mergeBars";

// The stream endpoint scans at most 1000 blocks per request (~100s of chain time).
const BOOTSTRAP_BLOCKS = 1000;

export default function useLiveCandles(address, timeframe) {
  const ms = INTERVAL_MS[timeframe];
  const [candles, setCandles] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [price, setPrice] = useState(null);
  const [drain, setDrain] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const pending = useRef([]);
  const priceRef = useRef(null);
  const oldestBlock = useRef(0); // lowest block already scanned for this view
  const storedLimit = useRef(200);
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

  // Base series for the selected interval.
  useEffect(() => {
    let alive = true;
    setCandles(null);
    setHasOlder(true);
    setLoadingOlder(true);
    oldestBlock.current = 0;
    storedLimit.current = 200;
    busy.current = false;

    // Merges a scanned window of real swaps under whatever the live stream has already drawn.
    const foldHistory = (data) => {
      if (!alive || !data) return;
      oldestBlock.current = data.scanned_from || 0;
      let scanned = [];
      for (const t of data.trades || []) scanned = applyTrade(scanned, t, ms);
      setCandles((prev) => {
        if (!prev?.length) return scanned.length ? fillIdle(scanned, ms) : prev || [];
        // Bars the stream already owns win; the scan only fills what came before them.
        return prependBars(scanned, prev);
      });
    };

    const settle = () => {
      if (!alive) return;
      setLoadingOlder(false);
      // Never leave the chart on a skeleton: fall back to the last known price.
      setCandles((prev) => prev ?? (priceRef.current ? seedSeries(priceRef.current, ms) : []));
    };

    if (isClientInterval(timeframe)) {
      fetchRhStream(address, 0, BOOTSTRAP_BLOCKS).then(foldHistory).catch(() => {}).finally(settle);
    } else {
      fetchRhCandles(address, timeframe, 200)
        .then((d) => {
          if (!alive) return null;
          const stored = d?.candles?.map((c) => ({ ...c })) || [];
          if (stored.length) setCandles((prev) => prependBars(stored, prev));
          // Indexed bars lag the head, so continue the series with swaps read from chain.
          return fetchRhStream(address, 0, BOOTSTRAP_BLOCKS).catch(() => null);
        })
        .then(foldHistory)
        .catch(() => {})
        .finally(settle);
    }
    return () => {
      alive = false;
    };
  }, [address, timeframe, ms]);

  // Draw immediately from the first price tick rather than waiting on the history scan.
  useEffect(() => {
    if (candles !== null || !price) return;
    setCandles(seedSeries(price, ms, isClientInterval(timeframe) ? 40 : 20));
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

  // Pull the previous page of history when the user pans/zooms back past the loaded bars.
  const loadOlder = useCallback(async () => {
    if (busy.current || !hasOlder) return;
    busy.current = true;
    setLoadingOlder(true);
    try {
      if (isClientInterval(timeframe)) {
        if (!oldestBlock.current) return; // bootstrap hasn't landed yet
        const to = oldestBlock.current - 1;
        if (to <= 0) return setHasOlder(false);
        const d = await fetchRhStreamBefore(address, to, BOOTSTRAP_BLOCKS).catch(() => null);
        if (!d) return setHasOlder(false);
        oldestBlock.current = d.scanned_from || 0;
        let older = [];
        for (const t of d.trades || []) older = applyTrade(older, t, ms);
        if (!older.length && !d.scanned_from) setHasOlder(false);
        setCandles((prev) => prependBars(older, prev));
      } else {
        const next = storedLimit.current + 200;
        const d = await fetchRhCandles(address, timeframe, next).catch(() => null);
        const stored = d?.candles?.map((c) => ({ ...c })) || [];
        if (!stored.length || stored.length < next) setHasOlder(false);
        storedLimit.current = next;
        setCandles((prev) => prependBars(stored, prev));
      }
    } finally {
      busy.current = false;
      setLoadingOlder(false);
    }
  }, [address, timeframe, ms, hasOlder]);

  return { candles, status, price, loadOlder, loadingOlder, hasOlder };
}