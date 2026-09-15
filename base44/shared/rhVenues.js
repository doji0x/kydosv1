// Venue adapters: each turns a raw log into the same normalized trade shape.
// { side, token_amount, quote_amount, trader } — amounts are human-scaled positives.
import { words, addrFromWord, toBig, toSigned, scaled } from "./rhRpc.js";
import { TOPIC } from "./rhConstants.js";

// Uniswap V2: Swap(address sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address to)
function parseV2(log, pool) {
  const w = words(log.data);
  if (w.length < 4) return null;
  const baseIs0 = pool.base_is_token0;
  const bd = pool.base_decimals ?? 18;
  const qd = pool.quote_decimals ?? 18;

  const baseIn = scaled(toBig(baseIs0 ? w[0] : w[1]), bd);
  const quoteIn = scaled(toBig(baseIs0 ? w[1] : w[0]), qd);
  const baseOut = scaled(toBig(baseIs0 ? w[2] : w[3]), bd);
  const quoteOut = scaled(toBig(baseIs0 ? w[3] : w[2]), qd);

  const buy = baseOut > baseIn;
  const token_amount = buy ? baseOut : baseIn;
  const quote_amount = buy ? quoteIn : quoteOut;
  if (!token_amount || !quote_amount) return null;

  return {
    side: buy ? "buy" : "sell",
    token_amount,
    quote_amount,
    trader: log.topics[2] ? addrFromWord(log.topics[2]) : addrFromWord(log.topics[1] || ""),
  };
}

// Uniswap V3: Swap(address sender, address recipient, int256 amount0, int256 amount1, uint160, uint128, int24)
function parseV3(log, pool) {
  const w = words(log.data);
  if (w.length < 2) return null;
  const bd = pool.base_decimals ?? 18;
  const qd = pool.quote_decimals ?? 18;

  const a0 = toSigned(w[0]);
  const a1 = toSigned(w[1]);
  const baseDelta = pool.base_is_token0 ? a0 : a1;
  const quoteDelta = pool.base_is_token0 ? a1 : a0;

  const token_amount = Math.abs(scaled(baseDelta, bd));
  const quote_amount = Math.abs(scaled(quoteDelta, qd));
  if (!token_amount || !quote_amount) return null;

  // Negative base delta = pool paid out the token = a buy.
  return {
    side: baseDelta < 0n ? "buy" : "sell",
    token_amount,
    quote_amount,
    trader: log.topics[2] ? addrFromWord(log.topics[2]) : addrFromWord(log.topics[1] || ""),
  };
}

function parseKydosCurve(log) {
  const w = words(log.data);
  if (w.length < 3) return null;
  const topic = (log.topics?.[0] || "").toLowerCase();
  const buy = topic === TOPIC.KYDOS_BUY;
  const sell = topic === TOPIC.KYDOS_SELL;
  if (!buy && !sell) return null;
  return {
    side: buy ? "buy" : "sell",
    token_amount: scaled(toBig(buy ? w[1] : w[0]), 18),
    quote_amount: scaled(toBig(buy ? w[0] : w[1]), 18),
    trader: addrFromWord(log.topics[1] || ""),
  };
}

export const SWAP_TOPICS_BY_VENUE = {
  uniswap_v2: [TOPIC.UNIV2_SWAP],
  uniswap_v3: [TOPIC.UNIV3_SWAP],
  kydos_curve: [TOPIC.KYDOS_BUY, TOPIC.KYDOS_SELL],
};
export const SWAP_TOPIC_BY_VENUE = { uniswap_v2: TOPIC.UNIV2_SWAP, uniswap_v3: TOPIC.UNIV3_SWAP };
export const isVenueSwap = (venue, topic) => (SWAP_TOPICS_BY_VENUE[venue] || []).includes(String(topic || "").toLowerCase());

// Rialto pools expose no known Swap signature, so their fills are inferred from the
// paired ERC20 Transfer legs in the same transaction (see inferRialtoTrades).
export function parseSwapLog(log, pool) {
  if (pool.venue === "uniswap_v2") return parseV2(log, pool);
  if (pool.venue === "uniswap_v3") return parseV3(log, pool);
  if (pool.venue === "kydos_curve") return parseKydosCurve(log);
  return null;
}

// Builds trades for a Rialto-style pool out of that pool's base-token Transfer legs.
// transfers: [{ from, to, value (human-scaled), tx_hash, log_index, block_number }]
export function inferRialtoTrades(transfers, pool) {
  const out = [];
  for (const t of transfers) {
    const inbound = t.to === pool.address;
    const outbound = t.from === pool.address;
    if (inbound === outbound) continue;
    if (!t.value) continue;
    out.push({
      side: outbound ? "buy" : "sell",
      token_amount: t.value,
      quote_amount: 0, // filled in by the caller from the paired quote-token leg
      trader: outbound ? t.to : t.from,
      tx_hash: t.tx_hash,
      log_index: t.log_index,
      block_number: t.block_number,
    });
  }
  return out;
}