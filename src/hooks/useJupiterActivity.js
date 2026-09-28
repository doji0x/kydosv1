import { useCallback, useEffect, useState } from 'react';
import { browserActivity, unresolved } from '@/lib/solana/lifecycle';
import { MAINNET_GENESIS, SWAP_SCOPE } from '@/lib/jupiterTrade';

export default function useJupiterActivity(wallet) {
  const [records, setRecords] = useState([]), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const refresh = useCallback(() => {
    try { setRecords(browserActivity().read()); setError(''); }
    catch { setError('Recovery storage is unavailable. Trading is disabled until it can be read.'); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    refresh(); window.addEventListener('storage', refresh); window.addEventListener('solana-activity', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('solana-activity', refresh); };
  }, [refresh]);
  const scoped = records.filter(record => record.scope.wallet === wallet && record.scope.chain === MAINNET_GENESIS && record.scope.program === SWAP_SCOPE);
  return { records: scoped, error, blocked: !loaded || !!error || scoped.some(unresolved), refresh };
}