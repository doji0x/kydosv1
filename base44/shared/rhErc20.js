// On-chain ERC20 + pool introspection via eth_call. No third-party metadata APIs.
import { ethCall, words, addrFromWord, toBig, toNum, scaled, decodeAbiString } from "./rhRpc.js";
import { SELECTOR } from "./rhConstants.js";

export async function erc20Decimals(address) {
  const ret = await ethCall(address, SELECTOR.decimals);
  const n = ret && ret !== "0x" ? toNum(ret) : 18;
  return n > 0 && n <= 36 ? n : 18;
}

export async function erc20Symbol(address) {
  return decodeAbiString(await ethCall(address, SELECTOR.symbol));
}

export async function erc20Name(address) {
  return decodeAbiString(await ethCall(address, SELECTOR.name));
}

export async function erc20TotalSupply(address, decimals) {
  const ret = await ethCall(address, SELECTOR.totalSupply);
  if (!ret || ret === "0x") return null;
  return scaled(toBig(ret), decimals);
}

export async function erc20BalanceOf(token, wallet, decimals) {
  const data = SELECTOR.balanceOf + wallet.replace("0x", "").padStart(64, "0");
  const ret = await ethCall(token, data);
  if (!ret || ret === "0x") return null;
  return scaled(toBig(ret), decimals);
}

// Returns { token0, token1, venue, fee } when `address` behaves like a DEX pool, else null.
export async function inspectPool(address) {
  const [t0, t1] = await Promise.all([
    ethCall(address, SELECTOR.token0),
    ethCall(address, SELECTOR.token1),
  ]);
  if (!t0 || t0 === "0x" || !t1 || t1 === "0x") return null;

  const token0 = addrFromWord(words(t0)[0]);
  const token1 = addrFromWord(words(t1)[0]);
  if (!/^0x[0-9a-f]{40}$/.test(token0) || token0 === "0x" + "0".repeat(40)) return null;

  const reserves = await ethCall(address, SELECTOR.getReserves);
  if (reserves && reserves !== "0x" && words(reserves).length >= 3) {
    return { token0, token1, venue: "uniswap_v2", fee: null };
  }

  const slot0 = await ethCall(address, SELECTOR.slot0);
  if (slot0 && slot0 !== "0x") {
    const feeRet = await ethCall(address, SELECTOR.fee);
    return { token0, token1, venue: "uniswap_v3", fee: feeRet && feeRet !== "0x" ? toNum(feeRet) : null };
  }

  // A contract that exposes token0/token1 but neither V2 reserves nor V3 slot0 is
  // treated as a Rialto-style PropAMM pool and indexed via transfer-pair inference.
  return { token0, token1, venue: "rialto", fee: null };
}

export async function v2Reserves(address, dec0, dec1) {
  const ret = await ethCall(address, SELECTOR.getReserves);
  if (!ret || ret === "0x") return null;
  const w = words(ret);
  if (w.length < 2) return null;
  return { reserve0: scaled(toBig(w[0]), dec0), reserve1: scaled(toBig(w[1]), dec1) };
}