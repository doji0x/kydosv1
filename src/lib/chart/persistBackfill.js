// Sends a completed chain scan back to the store so it is never re-scanned.
//
// Fire-and-forget: a failed write only costs the next visitor another scan, so it must
// never block or break the chart that just rendered.
import { persistRhBackfill } from "@/lib/rhApi";
import { SERVER_INTERVALS } from "@/lib/rollCandles";

const TRADES_PER_FLUSH = 500;
const CANDLES_PER_FLUSH = 200;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * @param trades decoded swaps from the scan
 * @param bars   rolled bars, only persisted when the interval is a stored one
 */
export async function persistScan(address, trades = [], bars = [], interval) {
  const storable = interval in SERVER_INTERVALS;
  const candles = storable
    ? bars.map((b) => ({ interval, bucket_start: b.t, ...b }))
    : [];
  if (!trades.length && !candles.length) return;

  const tradePages = chunk(trades, TRADES_PER_FLUSH);
  const candlePages = chunk(candles, CANDLES_PER_FLUSH);
  const pages = Math.max(tradePages.length, candlePages.length);

  for (let i = 0; i < pages; i++) {
    try {
      await persistRhBackfill(address, tradePages[i] || [], candlePages[i] || []);
    } catch {
      return; // the store stays behind; the next visit will try again
    }
  }
}