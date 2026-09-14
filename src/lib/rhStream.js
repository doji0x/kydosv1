// Live tick transport for the real-time chart.
//
// Polls getRhStream on a ~1s loop with a block cursor, so every tick carries the real
// swaps decoded since the last poll. Backs off on failure and never overlaps requests.
import { fetchRhStream } from "@/lib/rhApi";

const BASE_MS = 1000;
const MAX_MS = 8000;
const streams = new Map();

// Chart and trade list share one connection, cursor and recent-trade buffer.
export function openRhStream(address, onTick, onStatus) {
  const key = address.toLowerCase();
  let stream = streams.get(key);
  if (!stream) {
    stream = { listeners: new Set(), status: "connecting", last: null, trades: [] };
    streams.set(key, stream);
    stream.stop = startTransport(key, (tick) => {
      const merged = new Map(stream.trades.map((t) => [`${t.tx_hash}-${t.log_index}`, t]));
      for (const t of tick.trades || []) merged.set(`${t.tx_hash}-${t.log_index}`, t);
      stream.trades = [...merged.values()].sort((a, b) => a.block_number - b.block_number || a.log_index - b.log_index).slice(-50);
      stream.last = tick;
      for (const listener of stream.listeners) listener.onTick(tick);
    }, (status) => {
      stream.status = status;
      for (const listener of stream.listeners) listener.onStatus?.(status);
    });
  }
  const listener = { onTick, onStatus };
  stream.listeners.add(listener);
  onStatus?.(stream.status);
  if (stream.last) onTick({ ...stream.last, trades: stream.trades });
  return () => {
    stream.listeners.delete(listener);
    if (!stream.listeners.size) { stream.stop(); streams.delete(key); }
  };
}

/**
 * Starts a stream for one token.
 * @param {string} address token address
 * @param {(tick: {trades: object[], price_usd: number, head_block: number}) => void} onTick
 * @param {(status: "connecting"|"live"|"retrying") => void} [onStatus]
 * @returns {() => void} stop function
 */
function startTransport(address, onTick, onStatus) {
  let stopped = false;
  let cursor = 0;
  let delay = BASE_MS;
  let timer = null;

  onStatus?.("connecting");

  const tick = async () => {
    if (stopped) return;
    try {
      const data = await fetchRhStream(address, cursor, cursor ? 0 : 40);
      if (stopped) return;
      if (data?.error) throw new Error(data.error);

      cursor = data.scanned_to ?? data.head_block ?? cursor;
      delay = BASE_MS;
      onStatus?.("live");
      onTick(data);
    } catch {
      if (stopped) return;
      // Keep the last cursor so the next success replays anything missed.
      delay = Math.min(delay * 2, MAX_MS);
      onStatus?.("retrying");
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };

  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}