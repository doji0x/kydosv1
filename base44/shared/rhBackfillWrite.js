// Validation for client-supplied backfill records.
//
// These arrive from a browser, so nothing is trusted: every field is re-derived or
// range-checked, and anything malformed is dropped rather than stored.
import { INTERVALS, CHAIN_ID_DEFAULT } from "./rhConstants.js";

const VENUES = ["uniswap_v2", "uniswap_v3", "rialto", "kydos_curve"];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isTxHash = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);

/** Normalizes client swaps into RhTrade records, dropping anything unusable. */
export function backfillTradeRecords(input, address, symbol) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();

  for (const t of input) {
    if (!isTxHash(t?.tx_hash)) continue;
    const logIndex = num(t.log_index);
    const uid = `${t.tx_hash.toLowerCase()}-${logIndex}`;
    if (seen.has(uid)) continue;

    const tokenAmount = num(t.token_amount);
    const quoteAmount = num(t.quote_amount);
    if (tokenAmount <= 0 || quoteAmount <= 0) continue;

    const side = t.side === "sell" ? "sell" : "buy";
    const venue = VENUES.includes(t.venue) ? t.venue : "uniswap_v2";
    // Price is recomputed from the amounts rather than taken on trust.
    const priceQuote = quoteAmount / tokenAmount;
    if (!Number.isFinite(priceQuote) || priceQuote <= 0) continue;

    const blockTime = num(t.block_time);
    if (blockTime <= 0 || blockTime > Date.now() + 60_000) continue;

    seen.add(uid);
    out.push({
      uid,
      chain_id: CHAIN_ID_DEFAULT,
      token_address: address,
      symbol: symbol || undefined,
      venue,
      pool: typeof t.pool === "string" ? t.pool.toLowerCase() : undefined,
      trader: typeof t.trader === "string" ? t.trader.toLowerCase() : undefined,
      side,
      token_amount: tokenAmount,
      quote_amount: quoteAmount,
      price_quote: priceQuote,
      price_usd: num(t.price_usd),
      volume_usd: num(t.volume_usd),
      block_number: num(t.block_number),
      block_time: blockTime,
      tx_hash: t.tx_hash.toLowerCase(),
      log_index: logIndex,
    });
  }
  return out;
}

/** Normalizes client bars into RhCandle records; sub-minute intervals are never stored. */
export function backfillCandleRecords(input, address) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();

  for (const bar of input) {
    const interval = String(bar?.interval || "");
    const intervalMs = INTERVALS[interval];
    if (!intervalMs) continue;

    const bucketStart = num(bar.bucket_start ?? bar.t);
    // The bucket must sit exactly on an interval boundary, or the uid key is meaningless.
    if (bucketStart <= 0 || bucketStart % intervalMs !== 0) continue;

    const key = `${interval}-${bucketStart}`;
    if (seen.has(key)) continue;

    const open = num(bar.open);
    const high = num(bar.high);
    const low = num(bar.low);
    const close = num(bar.close);
    if (open <= 0 || close <= 0 || high <= 0 || low <= 0 || high < low) continue;

    seen.add(key);
    out.push({
      token_address: address,
      interval,
      bucket_start: bucketStart,
      open,
      high,
      low,
      close,
      volume_usd: num(bar.volume_usd),
      trades: num(bar.trades),
    });
  }
  return out;
}