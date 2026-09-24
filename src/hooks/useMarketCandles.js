import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { candleQueryKey, MAX_CHART_CANDLES, mergeCandlePages, validateCandlePage } from '@/lib/marketCandles';

async function requestCandles(input, signal) {
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 25_000);
  try {
    let data;
    try { ({ data } = await base44.functions.invoke('marketCandles', input)); }
    catch (error) {
      const failure = new Error(error.response?.data?.error || error.message || 'Chart data is temporarily unavailable.');
      failure.status = error.response?.status; failure.retryAfter = Math.min(3600, Math.max(60, Number(error.response?.data?.retryAfter) || 60)); throw failure;
    }
    if (controller.signal.aborted) throw new DOMException('Chart request cancelled.', 'AbortError');
    return validateCandlePage(data, input);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export default function useMarketCandles(mint, interval = '1h', { enabled = true, compact = false } = {}) {
  const client = useQueryClient(), identity = `${mint}:${interval}`;
  const active = useRef(identity), historyRequest = useRef(null);
  active.current = identity;
  const [history, setHistory] = useState(null), [historyError, setHistoryError] = useState(''), [loadingOlder, setLoadingOlder] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    setHistoryError(''); setLoadingOlder(false);
    return () => { historyRequest.current?.abort(); historyRequest.current = null; };
  }, [identity]);
  const result = useQuery({
    queryKey: candleQueryKey(mint, interval), enabled,
    queryFn: ({ signal }) => requestCandles({ mint, interval, pool: client.getQueryData(candleQueryKey(mint, interval))?.pool.address || null }, signal),
    staleTime: 30_000, gcTime: 30 * 60_000,
    refetchInterval: query => Math.max(60_000, (query.state.data?.retryAfter || query.state.error?.retryAfter || 0) * 1000),
    refetchIntervalInBackground: false, refetchOnWindowFocus: false,
    retry: (count, error) => ![400, 401, 403, 404].includes(error.status) && count < 2,
    retryDelay: (_, error) => (error.retryAfter || 60) * 1000,
  });
  const page = result.data, currentHistory = history?.identity === identity && history.pool === page?.pool.address ? history : null;
  const candles = useMemo(() => mergeCandlePages(currentHistory?.candles || [], page?.candles || []).slice(-MAX_CHART_CANDLES), [currentHistory, page]);
  const nextBefore = currentHistory ? currentHistory.nextBefore : page?.nextBefore;
  const hasMore = candles.length < MAX_CHART_CANDLES && (currentHistory ? currentHistory.hasMore : page?.hasMore);
  const loadOlder = useCallback(async () => {
    if (!hasMore || !nextBefore || !page || historyRequest.current) return;
    const controller = new AbortController(); historyRequest.current = controller;
    setLoadingOlder(true); setHistoryError('');
    try {
      const older = await requestCandles({ mint, interval, pool: page.pool.address, before: nextBefore }, controller.signal);
      if (active.current !== identity || controller.signal.aborted) return;
      setHistory({ identity, pool: page.pool.address, candles: mergeCandlePages(older.candles, candles).slice(-MAX_CHART_CANDLES), nextBefore: older.nextBefore, hasMore: older.hasMore });
      if (older.stale) setHistoryError(older.warning || 'Older candles are from the saved history.');
    } catch (error) { if (active.current === identity && !controller.signal.aborted) setHistoryError(error.message || 'Older candles could not be loaded.'); }
    finally { if (historyRequest.current === controller) { historyRequest.current = null; setLoadingOlder(false); } }
  }, [hasMore, nextBefore, page, mint, interval, identity, candles]);
  const error = result.error || result.failureReason;
  return { ...result, error, candles, page, now, loadOlder, loadingOlder, hasMore, historyError, atHistoryLimit: candles.length >= MAX_CHART_CANDLES, stale: !!page?.stale || !!error || !!page && now - page.fetchedAt > 120_000 };
}