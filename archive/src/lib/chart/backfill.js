// Walks a token's swap history backwards off the chain, page by page.
//
// Each page is a bounded log scan (the stream endpoint caps a window at 1000 blocks), so
// reaching launch day means many sequential pages. Paging stops at the first of: `minBlock`
// (where the store already has the history), the start of the token's history (several
// consecutive empty windows, or block 0), the caller's max age, or the wall-clock budget.
//
// Once a scan has been persisted, later visitors pass minBlock and only cover the live gap.
import { fetchRhStreamBefore } from "@/lib/rhApi";

const WINDOW_BLOCKS = 1000;
const EMPTY_WINDOWS_TO_STOP = 5;

export async function backfillSwaps({
  address,
  headBlock,
  maxAgeMs = 0,
  budgetMs = 30_000,
  minBlock = 0,
  alive = () => true,
  onProgress,
  onBatch,
}) {
  const trades = [];
  const startedAt = Date.now();
  const oldestAllowed = maxAgeMs ? Date.now() - maxAgeMs : 0;
  let to = headBlock;
  let oldestBlock = headBlock;
  let pages = 0;
  let emptyStreak = 0;
  let reachedStart = false;
  let stoppedAtMin = false;

  while (alive() && to > 0 && Date.now() - startedAt < budgetMs) {
    const page = await fetchRhStreamBefore(address, to, WINDOW_BLOCKS).catch(() => null);
    if (!page || page.error) break;
    const batch = page.trades || [];
    trades.push(...batch);
    oldestBlock = page.scanned_from || 0;
    pages += 1;
    const oldestTime = batch.reduce((min, t) => Math.min(min, t.block_time || Infinity), Infinity);
    onProgress?.({ pages, trades: trades.length, oldestTime: isFinite(oldestTime) ? oldestTime : null });
    // Hand each page up as it lands so the chart can grow while the walk continues.
    if (batch.length) onBatch?.(trades.slice(), oldestBlock);

    // Everything below minBlock is already in the store — that's the whole point.
    if (minBlock && oldestBlock <= minBlock) {
      stoppedAtMin = true;
      break;
    }

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

  return { trades, oldestBlock, pages, reachedStart, stoppedAtMin };
}