// Walks a token's swap history backwards off the chain, page by page.
//
// Each page is a bounded log scan (the stream endpoint caps a window at 1000 blocks), so
// reaching launch day means many sequential pages. Paging stops at the first of: the start
// of the token's history (several consecutive empty windows, or block 0), the caller's max
// age, or the wall-clock budget — the free-tier RPC cannot be pushed harder than that.
import { fetchRhStreamBefore } from "@/lib/rhApi";

const WINDOW_BLOCKS = 1000;
const EMPTY_WINDOWS_TO_STOP = 5;

export async function backfillSwaps({
  address,
  headBlock,
  maxAgeMs = 0,
  budgetMs = 30_000,
  alive = () => true,
  onProgress,
}) {
  const trades = [];
  const startedAt = Date.now();
  const oldestAllowed = maxAgeMs ? Date.now() - maxAgeMs : 0;
  let to = headBlock;
  let oldestBlock = headBlock;
  let pages = 0;
  let emptyStreak = 0;
  let reachedStart = false;

  while (alive() && to > 0 && Date.now() - startedAt < budgetMs) {
    const page = await fetchRhStreamBefore(address, to, WINDOW_BLOCKS).catch(() => null);
    if (!page || page.error) break;
    const batch = page.trades || [];
    trades.push(...batch);
    oldestBlock = page.scanned_from || 0;
    pages += 1;
    const oldestTime = batch.reduce((min, t) => Math.min(min, t.block_time || Infinity), Infinity);
    onProgress?.({ pages, trades: trades.length, oldestTime: isFinite(oldestTime) ? oldestTime : null });

    emptyStreak = batch.length ? 0 : emptyStreak + 1;
    if (emptyStreak >= EMPTY_WINDOWS_TO_STOP || oldestBlock <= 1) {
      reachedStart = true;
      break;
    }
    if (oldestAllowed && isFinite(oldestTime) && oldestTime <= oldestAllowed) {
      reachedStart = true;
      break;
    }
    to = oldestBlock - 1;
  }

  return { trades, oldestBlock, pages, reachedStart };
}