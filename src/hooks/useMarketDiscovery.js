import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fallbackSnapshot, MARKET_NETWORK, snapshotStatus } from '@/lib/markets';

export default function useMarketDiscovery() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const result = useQuery({
    queryKey: ['market-discovery', MARKET_NETWORK, 1],
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 20_000);
      try {
        const response = await base44.functions.fetch('/marketDiscovery', { method: 'GET', signal: controller.signal });
        if (!response.ok) {
          const error = new Error(response.status === 401 || response.status === 403 ? 'This app currently requires sign-in to read market data.' : 'Market data is temporarily unavailable.');
          error.status = response.status; throw error;
        }
        const data = await response.json();
        if (data?.schema !== 1 || data.network !== MARKET_NETWORK || !Array.isArray(data.tokens) || !data.trending) throw new Error('Market data is temporarily unavailable.');
        return data;
      } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    },
    staleTime: 20_000, refetchInterval: 30_000, refetchIntervalInBackground: false,
    retry: (failureCount, error) => error.status !== 401 && error.status !== 403 && failureCount < 1,
  });
  const snapshot = result.data || fallbackSnapshot;
  return { ...result, snapshot, now, status: snapshotStatus(snapshot.fetchedAt, now) };
}
