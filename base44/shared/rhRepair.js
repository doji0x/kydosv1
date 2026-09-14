import { rpc, toNum } from "./rhRpc.js";
import { parseSwapLog, SWAP_TOPIC_BY_VENUE } from "./rhVenues.js";
import { isUsableTrade } from "./rhMarket.js";

export async function refetchTrade(db, trade) {
  const pools = await db.entities.RhPool.filter({ address: trade.pool });
  const pool = pools[0];
  if (!pool || pool.venue === "rialto" || !trade.tx_hash) return null;
  const receipt = await rpc("eth_getTransactionReceipt", [trade.tx_hash]);
  const topic = SWAP_TOPIC_BY_VENUE[pool.venue];
  const log = receipt?.logs?.find((item) => item.address?.toLowerCase() === pool.address && item.topics?.[0]?.toLowerCase() === topic);
  if (!log) return null;
  const decoded = parseSwapLog(log, pool);
  if (!decoded) return null;
  const priceQuote = decoded.quote_amount / decoded.token_amount;
  const quoteUsd = trade.price_quote > 0 ? trade.price_usd / trade.price_quote : 0;
  const repaired = {
    ...trade,
    id: undefined,
    uid: `${trade.uid}-repair-${Date.now()}`,
    side: decoded.side,
    trader: decoded.trader,
    token_amount: decoded.token_amount,
    quote_amount: decoded.quote_amount,
    price_quote: priceQuote,
    price_usd: priceQuote * quoteUsd,
    volume_usd: decoded.quote_amount * quoteUsd,
    log_index: toNum(log.logIndex),
    status: "REPAIRED",
    repair_of: trade.uid,
    repair_reason: "REFETCHED_AND_REDECODED",
    verification_method: "deterministic"
  };
  return isUsableTrade(repaired) ? repaired : null;
}