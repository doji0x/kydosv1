import { useEffect, useState } from "react";
import { fetchRhTrades } from "@/lib/rhApi";
import { openRhStream } from "@/lib/rhStream";

const key = (t) => `${t.tx_hash}-${t.log_index}`;
function merge(old, incoming) {
  const entries = new Map((old || []).map((t) => [key(t), t]));
  for (const t of incoming) entries.set(key(t), { ...t, block_time: t.block_time ?? t.timestamp });
  return [...entries.values()].sort((a, b) => b.block_time - a.block_time || b.block_number - a.block_number || b.log_index - a.log_index).slice(0, 50);
}
export default function useRhTrades(address) {
  const [trades, setTrades] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setTrades(null); setError(null);
    const stop = openRhStream(address, (tick) => {
      if (tick.trades?.length) setTrades((old) => merge(old, tick.trades));
    }, setStatus);
    fetchRhTrades(address).then((data) => {
      if (!alive) return;
      if (data.error) throw new Error(data.error);
      setTrades((old) => merge(old, data.trades || []));
    }).catch(() => {
      if (alive) { setError("Trade history unavailable; listening for live swaps."); setTrades((old) => old || []); }
    });
    return () => { alive = false; stop(); };
  }, [address]);
  return { trades, status, error };
}