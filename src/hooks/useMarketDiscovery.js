import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fallbackSnapshot, MARKET_NETWORK, snapshotStatus } from '@/lib/markets';

export default function useMarketDiscovery({ interval = '24h', mint = null } = {}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const result = useQuery({
    queryKey: ['market-discovery', MARKET_NETWORK, 2, interval, mint],
    queryFn: async () => {
      try {
        const { data } = await base44.functions.invoke('marketDiscovery', { interval, ...(mint ? { mint } : {}) });
        if (data?.schema !== 1 || data.network !== MARKET_NETWORK || !Array.isArray(data.tokens) || !data.trending) throw new Error('Market data is temporarily unavailable.');
        return data;
      } catch (error) {
        const failure = new Error(error.response?.data?.error || error.message || 'Market data is temporarily unavailable.');
        failure.status = error.response?.status; throw failure;
      }
    },
    staleTime: 20_000, refetchInterval: 30_000, refetchIntervalInBackground: false,
    retry: (failureCount, error) => error.status !== 401 && error.status !== 403 && failureCount < 1,
  });
  const snapshot = result.data || fallbackSnapshot;
  return { ...result, snapshot, now, status: snapshotStatus(snapshot.fetchedAt, now) };
}