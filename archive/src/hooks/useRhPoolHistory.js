import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRhPoolTrades } from "@/lib/rhApi";

export default function useRhPoolHistory(address, onTrades) {
  const cursor = useRef(undefined), generation = useRef(0), busy = useRef(false);
  const [state, setState] = useState({ loading: true, error: null, scanned: 0, hasMore: true });
  const loadMore = useCallback(async () => {
    if (busy.current || cursor.current === null) return;
    const run = generation.current;
    busy.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // Search up to three windows if the pool has been quiet; every window remains pageable.
      for (let page = 0; page < 3; page++) {
        const data = await fetchRhPoolTrades(address, cursor.current);
        if (run !== generation.current) return;
        if (data.error) throw new Error(data.error);
        cursor.current = data.next_before_block;
        onTrades(data.trades || []);
        setState((s) => ({ ...s, hasMore: cursor.current !== null,
          scanned: s.scanned + Math.max(0, data.scanned_to - data.scanned_from + 1) }));
        if (data.trades?.length || cursor.current === null) break;
      }
    } catch {
      if (run === generation.current) setState((s) => ({ ...s, error: "Pool history could not load. Retry below; live monitoring continues." }));
    } finally {
      if (run === generation.current) {
        busy.current = false;
        setState((s) => ({ ...s, loading: false }));
      }
    }
  }, [address, onTrades]);
  useEffect(() => {
    generation.current++;
    cursor.current = undefined; busy.current = false;
    setState({ loading: true, error: null, scanned: 0, hasMore: true });
    loadMore();
    return () => { generation.current++; };
  }, [loadMore]);
  return { ...state, loadMore };
}