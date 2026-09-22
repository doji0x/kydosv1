import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { feedHealth, mergeTrades } from '@/lib/solana/chartFeed';
export default function useSolanaChartFeed(mint) {
  const [trades, setTrades] = useState([]), [marketInfo, setMarketInfo] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [cursor, setCursor] = useState(null), [lastSync, setLastSync] = useState(null), [network, setNetwork] = useState(null), [coverage, setCoverage] = useState(null);
  const [now, setNow] = useState(Date.now()), session = useRef({});
  const load = useCallback(async ({ backfill = false } = {}) => {
    const current = session.current, lane = backfill ? 'history' : 'live';
    if (current[lane] || (backfill && !current.before)) return;
    current[lane] = true; setLoading(true);
    try {
      // Independent lanes; ascending live pages catch bursts without skipping.
      for (let page = 0; page < (backfill ? 1 : 5); page++) {
        const initial = !current.initialized;
        const payload = { mint, chain: current.chain, ...(backfill ? { before: current.before } : current.after ? { after: current.after } : {}) };
        const { data } = await base44.functions.invoke('solanaTokenChart', payload);
        if (session.current !== current) return;
        if (current.chain && current.chain !== data.network.chain) throw new Error('Chart network changed. Reload the market.');
        current.chain = data.network.chain; setNetwork(data.network);
        setTrades(previous => mergeTrades(previous, data.trades || []));
        if (initial || !backfill) { setMarketInfo(data.marketInfo); setCoverage(data.coverage); setLastSync(Date.now()); }
        if (initial || backfill) { current.before = data.nextBefore; setCursor(data.nextBefore); }
        if (!backfill) { current.after = data.nextAfter; current.initialized = true; }
        setError(''); if (backfill || initial || !data.hasMore) break;
      }
    } catch (failure) { if (session.current === current) setError(failure?.response?.data?.error || failure.message); }
    finally { current[lane] = false; if (session.current === current) setLoading(!!current.live || !!current.history); }
  }, [mint]);
  useEffect(() => {
    session.current = {}; setTrades([]); setMarketInfo(null); setCursor(null); setLastSync(null); setCoverage(null); setNetwork(null); setError('');
    load(); return () => { session.current = {}; };
  }, [mint, load]);
  useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); load(); }, 10000); return () => clearInterval(timer); }, [load]);
  const health = feedHealth({ now, lastSync, coverage, error });
  return { trades, marketInfo, loading, error, cursor, lastSync, network, coverage, health, latest: trades.at(-1)?.blockTime || null, stale: health !== 'Synced', backfill: () => load({ backfill: true }), refreshLatest: load };
}
