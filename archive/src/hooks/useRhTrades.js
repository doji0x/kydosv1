import { useCallback, useEffect, useState } from "react";
import useRhPoolHistory from "@/hooks/useRhPoolHistory";
import { openRhStream } from "@/lib/rhStream";

const key = (t) => `${t.tx_hash}-${t.log_index}`;
function merge(old, incoming) {
  const entries = new Map((old || []).map((t) => [key(t), t]));
  for (const t of incoming) entries.set(key(t), { ...t, block_time: t.block_time ?? t.timestamp });
  return [...entries.values()].sort((a, b) => b.block_number - a.block_number || b.log_index - a.log_index);
}
export default function useRhTrades(address) {
  const [trades, setTrades] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [checkedAt, setCheckedAt] = useState(null);
  const receive = useCallback((incoming) => setTrades((old) => merge(old, incoming)), []);
  useEffect(() => {
    setTrades([]); setCheckedAt(null);
    const stop = openRhStream(address, (tick) => {
      receive(tick.trades || []);
      setCheckedAt(tick.server_time);
    }, setStatus);
    return stop;
  }, [address, receive]);
  const history = useRhPoolHistory(address, receive);
  return { trades, status, checkedAt, history };
}