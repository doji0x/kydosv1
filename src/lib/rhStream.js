// Live tick transport for the real-time chart.
//
// Polls getRhStream on a ~1s loop with a block cursor, so every tick carries the real
// swaps decoded since the last poll. Backs off on failure and never overlaps requests.
import { fetchRhStream } from "@/lib/rhApi";

const BASE_MS = 1000;
const MAX_MS = 8000;

/**
 * Starts a stream for one token.
 * @param {string} address token address
 * @param {(tick: {trades: object[], price_usd: number, head_block: number}) => void} onTick
 * @param {(status: "connecting"|"live"|"retrying") => void} [onStatus]
 * @returns {() => void} stop function
 */
export function openRhStream(address, onTick, onStatus) {
  let stopped = false;
  let cursor = 0;
  let delay = BASE_MS;
  let timer = null;

  onStatus?.("connecting");

  const tick = async () => {
    if (stopped) return;
    try {
      const data = await fetchRhStream(address, cursor);
      if (stopped) return;
      if (data?.error) throw new Error(data.error);

      cursor = data.head_block || cursor;
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