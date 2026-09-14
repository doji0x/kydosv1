// Browser-side decoding of raw swap logs — the same normalization the indexer's venue
// adapters do server-side, so a streamed trade and an indexed trade have one shape.

const words = (data) => {
  const body = (data || "0x").slice(2);
  const out = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push("0x" + body.slice(i, i + 64));
  return out;
};

const toSigned = (h) => {
  const v = BigInt(h);
  return v >= 1n << 255n ? v - (1n << 256n) : v;
};

function scaled(value, decimals) {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const n = Number(abs / base) + Number(abs % base) / Number(base);
  return neg ? -n : n;
}

const addrFromWord = (w) => ("0x" + w.slice(-40)).toLowerCase();

// Uniswap V2: Swap(sender, amount0In, amount1In, amount0Out, amount1Out, to)
function parseV2(log, pool) {
  const w = words(log.data);
  if (w.length < 4) return null;
  const b0 = pool.base_is_token0;
  const bd = pool.base_decimals;
  const qd = pool.quote_decimals;

  const baseIn = scaled(BigInt(b0 ? w[0] : w[1]), bd);
  const quoteIn = scaled(BigInt(b0 ? w[1] : w[0]), qd);
  const baseOut = scaled(BigInt(b0 ? w[2] : w[3]), bd);
  const quoteOut = scaled(BigInt(b0 ? w[3] : w[2]), qd);

  const buy = baseOut > baseIn;
  const token_amount = buy ? baseOut : baseIn;
  const quote_amount = buy ? quoteIn : quoteOut;
  if (!token_amount || !quote_amount) return null;
  return { side: buy ? "buy" : "sell", token_amount, quote_amount };
}

// Uniswap V3: Swap(sender, recipient, int256 amount0, int256 amount1, ...)
function parseV3(log, pool) {
  const w = words(log.data);
  if (w.length < 2) return null;
  const a0 = toSigned(w[0]);
  const a1 = toSigned(w[1]);
  const baseDelta = pool.base_is_token0 ? a0 : a1;
  const quoteDelta = pool.base_is_token0 ? a1 : a0;

  const token_amount = Math.abs(scaled(baseDelta, pool.base_decimals));
  const quote_amount = Math.abs(scaled(quoteDelta, pool.quote_decimals));
  if (!token_amount || !quote_amount) return null;
  // Pool paying the token out means the trader bought it.
  return { side: baseDelta < 0n ? "buy" : "sell", token_amount, quote_amount };
}

/** Turns a raw log into a normalized, USD-priced trade, or null if it isn't a swap we read. */
export function decodeSwap(log, pool) {
  let parsed = null;
  try {
    parsed = pool.venue === "uniswap_v3" ? parseV3(log, pool) : parseV2(log, pool);
  } catch {
    return null;
  }
  if (!parsed) return null;

  const price_quote = parsed.quote_amount / parsed.token_amount;
  const price_usd = price_quote * (pool.quote_usd || 0);
  if (!price_usd || !isFinite(price_usd)) return null;

  return {
    ...parsed,
    pool: pool.address,
    venue: pool.venue,
    trader: log.topics?.[2] ? addrFromWord(log.topics[2]) : null,
    price_quote,
    price_usd,
    volume_usd: parsed.quote_amount * (pool.quote_usd || 0),
    block_number: log.blockNumber ? Number(BigInt(log.blockNumber)) : 0,
    block_time: Date.now(),
    tx_hash: log.transactionHash || null,
  };
}