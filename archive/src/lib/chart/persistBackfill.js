// Sends a completed chain scan back to the store so it is never re-scanned.
//
// Fire-and-forget: a failed write only costs the next visitor another scan, so it must
// never block or break the chart that just rendered.
import { persistRhBackfill } from "@/lib/rhApi";

const TRADES_PER_FLUSH = 500;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * @param trades decoded swaps from the scan
 * @param bars   rolled bars, only persisted when the interval is a stored one
 */
export async function persistScan(address, trades = []) {
  if (!trades.length) return;

  const tradePages = chunk(trades, TRADES_PER_FLUSH);
  for (let i = 0; i < tradePages.length; i++) {
    try {
      // Persist raw verified fills only. Candles are always rebuilt server-side from those
      // fills, so a stale browser can never write a malformed wick into the canonical store.
      await persistRhBackfill(address, tradePages[i], []);
    } catch {
      return; // the store stays behind; the next visit will try again
    }
  }
}