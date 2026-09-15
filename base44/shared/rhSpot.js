// Spot pricing straight from pool state via eth_call.
//
// Trade-derived prices need indexed swaps; pool state does not. This lets the
// aggregator publish a live price, market cap and FDV even before (or without)
// a full swap history.
import { ethCall, words, toBig, scaled } from "./rhRpc.js";
import { SELECTOR } from "./rhConstants.js";

const Q96 = 2n ** 96n;

// Uniswap V3: price(token1 per token0) = (sqrtPriceX96 / 2^96)^2, then decimal-adjusted.
async function v3Price(pool) {
  const ret = await ethCall(pool.address, SELECTOR.slot0);
  if (!ret || ret === "0x") return null;
  const sqrtPriceX96 = toBig(words(ret)[0] || "0x0");
  if (!sqrtPriceX96) return null;

  const ratio = Number(sqrtPriceX96) / Number(Q96);
  const price1Per0 = ratio * ratio;
  if (!isFinite(price1Per0) || price1Per0 <= 0) return null;

  const d0 = pool.base_is_token0 ? pool.base_decimals ?? 18 : pool.quote_decimals ?? 18;
  const d1 = pool.base_is_token0 ? pool.quote_decimals ?? 18 : pool.base_decimals ?? 18;
  const adjusted = price1Per0 * 10 ** (d0 - d1);

  // Return quote-per-base regardless of pool token ordering.
  return pool.base_is_token0 ? adjusted : 1 / adjusted;
}

// Uniswap V2 (and Rialto-style pools that expose getReserves): quote/base reserves.
async function curvePrice(pool) {
  const ret = await ethCall(pool.address, SELECTOR.currentPrice);
  return ret && ret !== "0x" ? scaled(toBig(ret), 18) : null;
}

async function v2Price(pool) {
  const ret = await ethCall(pool.address, SELECTOR.getReserves);
  if (!ret || ret === "0x") return null;
  const w = words(ret);
  if (w.length < 2) return null;

  const d0 = pool.base_is_token0 ? pool.base_decimals ?? 18 : pool.quote_decimals ?? 18;
  const d1 = pool.base_is_token0 ? pool.quote_decimals ?? 18 : pool.base_decimals ?? 18;
  const r0 = scaled(toBig(w[0]), d0);
  const r1 = scaled(toBig(w[1]), d1);
  if (!r0 || !r1) return null;

  const base = pool.base_is_token0 ? r0 : r1;
  const quote = pool.base_is_token0 ? r1 : r0;
  return base ? quote / base : null;
}

/** Quote-token price of one base token, read live from the pool. */
export async function spotPriceQuote(pool) {
  if (pool.venue === "uniswap_v3") return v3Price(pool);
  if (pool.venue === "kydos_curve") return curvePrice(pool);
  return v2Price(pool);
}