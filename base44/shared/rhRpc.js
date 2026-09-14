// Raw JSON-RPC access to Robinhood Chain (Arbitrum Orbit L2, chain id 4663).
// Uses plain outbound fetch() — NOT a Core integration — so it never consumes integration credits.
import { secrets } from "base44:runtime";

export const CHAIN_ID = 4663;
export const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

export function rpcUrl() {
  try {
    return secrets.get("RH_RPC_URL") || PUBLIC_RPC;
  } catch {
    return PUBLIC_RPC;
  }
}

let reqId = 0;
let primaryDisabled = false; // flips when the configured provider rejects our key

export const usingFallback = () => primaryDisabled;

async function post(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++reqId, method, params }),
  });
  return res;
}

// Serializes calls with a minimum gap so the shared public endpoint doesn't throttle us.
let nextCallAt = 0; // Keep only timestamps globally; I/O promises belong to one request.
let gapMs = 0; // adaptive: grows when the endpoint throttles, decays as calls succeed

function paced() {
  const floor = primaryDisabled ? 120 : 0;
  const wait = Math.max(floor, gapMs);
  const now = Date.now();
  const delay = Math.max(0, nextCallAt - now);
  nextCallAt = now + delay + wait;
  return delay ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
}

export async function rpc(method, params = [], jsonRetry = 0) {
  await paced();
  const primary = rpcUrl();
  let res = null;

  if (!primaryDisabled) {
    res = await post(primary, method, params).catch(() => null);
    // A bad/absent provider key must not take the indexer down: fall back to the
    // rate-limited public endpoint for the rest of this invocation.
    if (!res || res.status === 401 || res.status === 403) {
      if (primary !== PUBLIC_RPC) primaryDisabled = true;
      res = null;
    }
  }

  if (!res) res = await post(PUBLIC_RPC, method, params);

  // The public endpoint throttles aggressively — back off and retry before giving up.
  for (let attempt = 0; attempt < 6 && res.status === 429; attempt++) {
    gapMs = Math.min(Math.max(gapMs * 2, 400), 2500);
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    res = await post(primaryDisabled ? PUBLIC_RPC : primary, method, params);
  }

  if (res.ok) gapMs = Math.max(0, gapMs * 0.85);
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);

  const json = await res.json();
  if (json.error) {
    // Some providers signal a bad/missing key at the JSON-RPC layer with a 200.
    const msg = String(json.error.message || "");
    if (/rate limit|too many requests|compute units/i.test(msg) && jsonRetry < 6) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (jsonRetry + 1)));
      return rpc(method, params, jsonRetry + 1);
    }
    if (!primaryDisabled && primary !== PUBLIC_RPC && /authenticat|api key|unauthor/i.test(msg)) {
      primaryDisabled = true;
      return rpc(method, params);
    }
    throw new Error(`RPC ${method}: ${msg}`);
  }
  return json.result;
}

export async function rpcBatch(method, paramsList) {
  if (!paramsList.length) return [];
  const primary = rpcUrl();
  const payload = paramsList.map((params) => ({ jsonrpc: "2.0", id: ++reqId, method, params }));
  const ids = payload.map((item) => item.id);
  const res = await fetch(primary, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return Promise.all(paramsList.map((params) => rpc(method, params).catch(() => null)));
  const json = await res.json();
  if (!Array.isArray(json)) return Promise.all(paramsList.map((params) => rpc(method, params).catch(() => null)));
  const byId = new Map(json.map((item) => [item.id, item.result ?? null]));
  return ids.map((id) => byId.get(id) ?? null);
}

export const hex = (n) => "0x" + BigInt(n).toString(16);
export const toNum = (h) => (h === null || h === undefined ? 0 : Number(BigInt(h)));
export const toBig = (h) => BigInt(h);

export function toSigned(h) {
  const v = BigInt(h);
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

export function scaled(value, decimals) {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const d = BigInt(decimals);
  const base = 10n ** d;
  const whole = abs / base;
  const frac = abs % base;
  const n = Number(whole) + Number(frac) / Number(base);
  return neg ? -n : n;
}

export function words(data) {
  const body = (data || "0x").slice(2);
  const out = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push("0x" + body.slice(i, i + 64));
  return out;
}

export const addrFromWord = (w) => ("0x" + w.slice(-40)).toLowerCase();

export async function blockNumber() {
  return toNum(await rpc("eth_blockNumber"));
}

export async function getLogs(filter) {
  return (await rpc("eth_getLogs", [filter])) || [];
}

export async function ethCall(to, data) {
  try {
    return await rpc("eth_call", [{ to, data }, "latest"]);
  } catch {
    return null;
  }
}

// Fetches timestamps for a set of block numbers, one call each, results cached per invocation.
export async function blockTimes(blockNums) {
  const out = {};
  for (const bn of [...new Set(blockNums)]) {
    const block = await rpc("eth_getBlockByNumber", [hex(bn), false]).catch(() => null);
    out[bn] = block ? toNum(block.timestamp) * 1000 : Date.now();
  }
  return out;
}

// Decodes an ABI-encoded string return value (used for symbol()/name()).
export function decodeAbiString(ret) {
  if (!ret || ret === "0x") return null;
  const w = words(ret);
  if (w.length < 3) {
    // Some tokens return a fixed bytes32 instead of a dynamic string.
    const raw = (ret.slice(2).match(/.{2}/g) || [])
      .map((b) => parseInt(b, 16))
      .filter((c) => c >= 32 && c < 127);
    return raw.length ? String.fromCharCode(...raw) : null;
  }
  const len = Number(BigInt(w[1]));
  const bytes = w
    .slice(2)
    .map((x) => x.slice(2))
    .join("")
    .slice(0, len * 2);
  const chars = (bytes.match(/.{2}/g) || []).map((b) => parseInt(b, 16));
  return String.fromCharCode(...chars.filter((c) => c > 0));
}