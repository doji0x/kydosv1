// Client access to the Kydos market API (our own indexer — no third-party market data).
import { base44 } from "@/api/base44Client";

const call = async (fn, payload = {}) => (await base44.functions.invoke(fn, payload)).data;

export const fetchRhTrending = (sort = "volume_24h") => call("getRhTrending", { sort });
export const fetchRhToken = (address) => call("getRhToken", { address });
export const fetchRhCandles = (address, interval = "5m", limit = 120, beforeTime = 0) =>
  call("getRhCandles", { address, interval, limit, before_time: beforeTime });
export const fetchRhTrades = (address, limit = 50, beforeBlock = 0) =>
  call("getRhTrades", { address, limit, before_block: beforeBlock });

export async function fetchAllRhCandles(address, interval) {
  const candles = [];
  let before = 0;
  do {
    const page = await fetchRhCandles(address, interval, 500, before);
    candles.unshift(...(page?.candles || []));
    before = page?.next_before_time || 0;
  } while (before);
  return candles;
}

export async function fetchAllRhTrades(address) {
  const trades = [];
  let before = 0;
  do {
    const page = await fetchRhTrades(address, 1000, before);
    trades.push(...(page?.trades || []));
    before = page?.next_before_block || 0;
  } while (before);
  return trades;
}
export const fetchRhPoolTrades = (address, beforeBlock) => call("getRhTrades", {
  address, source: "onchain", ...(beforeBlock !== undefined ? { before_block: beforeBlock } : {}),
});
export const fetchRhStream = (address, sinceBlock = 0, windowBlocks = 0) =>
  call("getRhStream", { address, since_block: sinceBlock, window_blocks: windowBlocks });
// Older history: scans the window ending at `toBlock`.
export const fetchRhStreamBefore = (address, toBlock, windowBlocks = 1000) =>
  call("getRhStream", { address, to_block: toBlock, window_blocks: windowBlocks });
export const fetchRhHolders = (address, limit = 20) => call("getRhHolders", { address, limit });
// Write-back: hands a completed client scan to the store so it is indexed once, not per view.
export const persistRhBackfill = (address, trades, candles) =>
  call("persistRhBackfill", { address, trades, candles });