import { useCallback, useEffect, useRef, useState } from 'react';
import { WATCHLIST_KEY, parseWatchlist, toggleSavedMarket } from '@/lib/markets';

const CHANGE_EVENT = 'kydos-market-watchlist-change';
export default function useMarketWatchlist() {
  const [saved, setSaved] = useState(() => {
    try { return parseWatchlist(localStorage.getItem(WATCHLIST_KEY)); } catch { return []; }
  });
  const [error, setError] = useState('');
  const memoryOnly = useRef(false);
  useEffect(() => {
    const update = event => {
      if (memoryOnly.current) return;
      if (event.type === 'storage' && event.key !== WATCHLIST_KEY && event.key !== null) return;
      try { setSaved(parseWatchlist(localStorage.getItem(WATCHLIST_KEY))); } catch { /* Keep the current in-memory list. */ }
    };
    window.addEventListener('storage', update); window.addEventListener(CHANGE_EVENT, update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener(CHANGE_EVENT, update); };
  }, []);
  const toggle = useCallback(token => {
    let current = saved;
    try { if (!memoryOnly.current) current = parseWatchlist(localStorage.getItem(WATCHLIST_KEY)); } catch { /* Browser storage may be disabled. */ }
    let next;
    try { next = toggleSavedMarket(current, token); } catch (reason) { setError(reason.message); return; }
    setSaved(next);
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      memoryOnly.current = false;
      window.dispatchEvent(new Event(CHANGE_EVENT)); setError('');
    } catch { memoryOnly.current = true; setError('Browser storage is unavailable. This watchlist will last only for this page visit.'); }
  }, [saved]);
  return { saved, toggle, error, has: mint => saved.some(token => token.mint === mint) };
}
