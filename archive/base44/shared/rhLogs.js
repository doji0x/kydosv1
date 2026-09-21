// Log source for the aggregator.
//
// The Robinhood public RPC refuses eth_getLogs from server egress IPs (hard 429,
// any range, any pacing), so this module transparently degrades to reading whole
// blocks plus their transaction receipts — both of which the endpoint does allow.
// Callers get the same log shape either way, plus block timestamps for free.
import { rpc, hex, toNum, getLogs } from "./rhRpc.js";
import { LOG_SPAN } from "./rhConstants.js";

let logsBanned = false;
export const logsUnavailable = () => logsBanned;

function matches(log, addresses, topic0s) {
  if (addresses && !addresses.has((log.address || "").toLowerCase())) return false;
  if (topic0s && !topic0s.has((log.topics?.[0] || "").toLowerCase())) return false;
  return true;
}

// Reads every log in [fromBlock, toBlock] by walking blocks and receipts.
// Stops early once `maxReceipts` receipts have been read so the caller never
// blows its invocation budget; `scanned_to` reports how far it actually got.
async function scanBlocks(fromBlock, toBlock, addresses, topic0s, maxReceipts) {
  const logs = [];
  const times = {};
  let receipts = 0;
  let scannedTo = fromBlock - 1;

  for (let bn = fromBlock; bn <= toBlock; bn++) {
    const block = await rpc("eth_getBlockByNumber", [hex(bn), true]).catch(() => null);
    if (!block) break;
    times[bn] = toNum(block.timestamp) * 1000;

    for (const tx of block.transactions || []) {
      if (receipts >= maxReceipts) return { logs, times, source: "block_scan", scanned_to: scannedTo };
      const receipt = await rpc("eth_getTransactionReceipt", [tx.hash]).catch(() => null);
      receipts++;
      if (!receipt) continue;
      for (const log of receipt.logs || []) {
        if (matches(log, addresses, topic0s)) logs.push(log);
      }
    }
    scannedTo = bn;
  }

  return { logs, times, source: "block_scan", scanned_to: scannedTo };
}

/**
 * Fetches logs for a block range.
 * @param {object} opts
 * @param {number} opts.fromBlock
 * @param {number} opts.toBlock
 * @param {string[]} [opts.addresses] contract addresses to keep (lowercase)
 * @param {string[]} [opts.topics] topic0 values to keep
 * @param {number} [opts.maxReceipts] receipt budget for the scanning fallback
 * @param {number} [opts.span] blocks per eth_getLogs call (defaults to LOG_SPAN)
 * @returns {Promise<{logs: object[], times: object, source: string, scanned_to: number}>}
 */
export async function rangeLogs({
  fromBlock,
  toBlock,
  addresses = null,
  topics = null,
  maxReceipts = 250,
  span = LOG_SPAN,
}) {
  const addrSet = addresses?.length ? new Set(addresses.map((a) => a.toLowerCase())) : null;
  const topicSet = topics?.length ? new Set(topics.map((t) => t.toLowerCase())) : null;

  if (!logsBanned) {
    // Providers cap the range per eth_getLogs call, so walk the window in chunks.
    const collected = [];
    let cursor = fromBlock;
    try {
      while (cursor <= toBlock) {
        const chunkTo = Math.min(cursor + span - 1, toBlock);
        const filter = { fromBlock: hex(cursor), toBlock: hex(chunkTo) };
        if (addresses?.length) filter.address = addresses.length === 1 ? addresses[0] : addresses;
        if (topics?.length) filter.topics = [topics.length === 1 ? topics[0] : topics];
        const raw = await getLogs(filter);
        for (const log of raw) if (matches(log, addrSet, topicSet)) collected.push(log);
        cursor = chunkTo + 1;
      }
      return { logs: collected, times: {}, source: "eth_getLogs", scanned_to: toBlock };
    } catch {
      // Endpoint won't serve logs to us — switch to scanning for the rest of this isolate.
      logsBanned = true;
    }
  }

  return scanBlocks(fromBlock, toBlock, addrSet, topicSet, maxReceipts);
}