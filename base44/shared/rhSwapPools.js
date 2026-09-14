import { TOPIC, isStable } from "./rhConstants.js";
export const swapTopic = { uniswap_v2: TOPIC.UNIV2_SWAP, uniswap_v3: TOPIC.UNIV3_SWAP };
export async function loadSwapPools(db, address, ethUsd) {
  const all = await db.entities.RhPool.filter({ token_address: address, active: true });
  return all.filter((p) => swapTopic[p.venue] && (!p.trust_status || p.trust_status === "TRUSTED")).map((p) => ({
    ...p, address: p.address.toLowerCase(),
    base_decimals: p.base_decimals ?? 18, quote_decimals: p.quote_decimals ?? 18,
    quote_usd: isStable(p.quote_symbol) ? 1 : /^(WETH|ETH)$/i.test(p.quote_symbol || "") ? ethUsd : 0,
  })).sort((a, b) => (b.liquidity_usd || 0) - (a.liquidity_usd || 0));
}