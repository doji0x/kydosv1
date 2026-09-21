import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const mergeTrades = (current, incoming) => {
  const bySignature = new Map(current.map(trade => [trade.signature, trade]));
  incoming.forEach(trade => bySignature.set(trade.signature, trade));
  return [...bySignature.values()].sort((a, b) => a.blockTime - b.blockTime);
};

export default function useSolanaChartFeed(mint, paused) {
  const [trades, setTrades] = useState([]), [marketInfo, setMarketInfo] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [cursor, setCursor] = useState(null), [lastSync, setLastSync] = useState(null);
  const generation = useRef(0), cursorRef = useRef(null), latestRef = useRef(null);
  const load = useCallback(async ({ backfill = false, silent = false } = {}) => {
    const request = ++generation.current;
    if (!silent) setLoading(true);
    try {
      const payload = { mint, pages: backfill ? 5 : 1 };
      if (backfill && cursorRef.current) payload.before = cursorRef.current;
      if (!backfill && latestRef.current) payload.since = latestRef.current;
      const { data } = await base44.functions.invoke('solanaTokenChart', payload);
      if (request !== generation.current) return;
      setTrades(current => mergeTrades(current, data.trades || []));
      if (data.marketInfo) setMarketInfo(data.marketInfo);
      if (!latestRef.current || backfill) { cursorRef.current = data.nextBefore; setCursor(data.nextBefore); }
      const newest = Math.max(latestRef.current || 0, ...(data.trades || []).map(trade => trade.blockTime));
      if (newest) latestRef.current = newest;
      setLastSync(Date.now()); setError('');
    } catch (failure) {
      if (request === generation.current) setError(failure?.response?.data?.error || failure.message);
    } finally { if (request === generation.current) setLoading(false); }
  }, [mint]);
  useEffect(() => { generation.current++; cursorRef.current = null; latestRef.current = null; setTrades([]); setMarketInfo(null); setCursor(null); load(); return () => { generation.current++; }; }, [mint, load]);
  useEffect(() => { if (paused) return; const timer = setInterval(() => load({ silent: true }), 10000); return () => clearInterval(timer); }, [paused, load]);
  const latest = trades.at(-1)?.blockTime || null;
  return { trades, marketInfo, loading, error, cursor, lastSync, latest, stale: !latest || Date.now() / 1000 - latest > 60,
    backfill: () => load({ backfill: true }), refreshLatest: () => load({ silent: true }) };
}