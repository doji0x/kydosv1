import { getLogs, hex, blockTimes } from "./rhRpc.js";
import { LOG_SPAN } from "./rhConstants.js";
import { parseSwapLog } from "./rhVenues.js";
import { swapTopic } from "./rhSwapPools.js";
import { isUsableTrade } from "./rhMarket.js";

// Always respect the provider's 10-block cap. A failure is retried by the caller:
// never silently switch a live feed to a slower, incomplete receipt scan.
export async function readPoolSwaps(pools, from, to) {
  if (from > to || !pools.length) return [];
  if (to - from + 1 > 1000) throw new Error("Swap scan exceeds 1000 blocks");
  const addresses = pools.map((p) => p.address);
  const topics = [[...new Set(pools.map((p) => swapTopic[p.venue]))]];
  const byAddress = new Map(pools.map((p) => [p.address, p]));
  const logs = [];
  for (let start = from; start <= to; start += LOG_SPAN * 4) {
    const chunks = [];
    for (let i = 0; i < 4 && start + i * LOG_SPAN <= to; i++) {
      const first = start + i * LOG_SPAN;
      chunks.push(getLogs({ address: addresses, topics, fromBlock: hex(first), toBlock: hex(Math.min(first + LOG_SPAN - 1, to)) }));
    }
    logs.push(...(await Promise.all(chunks)).flat());
  }
  const times = await blockTimes([...new Set(logs.map((l) => Number(BigInt(l.blockNumber))))]);
  return logs.filter((l) => !l.removed).map((log) => {
    const pool = byAddress.get(log.address.toLowerCase());
    const parsed = pool && parseSwapLog(log, pool);
    if (!parsed) return null;
    const priceQuote = parsed.quote_amount / parsed.token_amount;
    if (!Number.isFinite(priceQuote) || priceQuote <= 0) return null;
    const bn = Number(BigInt(log.blockNumber));
    return { ...parsed, pool: pool.address, venue: pool.venue,
      price_quote: priceQuote, price_usd: priceQuote * pool.quote_usd,
      volume_usd: parsed.quote_amount * pool.quote_usd,
      block_number: bn, block_time: times[bn], tx_hash: log.transactionHash,
      log_index: Number(BigInt(log.logIndex)),
    };
  }).filter(isUsableTrade).sort((a, b) => a.block_number - b.block_number || a.log_index - b.log_index);
}