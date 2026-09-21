// Mirrors bonding-curve fills into the normalized trade stream as the `kydos_curve`
// venue, so a token's pre-graduation history and its post-graduation DEX swaps read as
// one continuous series. Curve markets quote in HOOD, so quote amounts are HOOD.
import { base44 } from "@/api/base44Client";

// A curve token has no contract address yet, so it gets a deterministic pseudo-address
// derived from its record id — stable across cycles and shaped like an EVM address.
export function curveAddress(tokenId) {
  const id = String(tokenId || "");
  let out = "";
  let h = 0x811c9dc5;
  for (let i = 0; out.length < 40; i++) {
    const ch = id.charCodeAt(i % Math.max(id.length, 1)) || i + 1;
    h = ((h ^ ch) * 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return "0x" + out.slice(0, 40);
}

/**
 * Records one curve fill in RhTrade. Never blocks the trade itself.
 */
export async function recordCurveTrade({ token, trade }) {
  const price = trade.price || (trade.token_amount ? trade.hood_amount / trade.token_amount : 0);
  try {
    await base44.entities.RhTrade.create({
      uid: `curve-${trade.id}`,
      chain_id: 4663,
      token_address: curveAddress(token.id),
      symbol: token.ticker,
      venue: "kydos_curve",
      pool: curveAddress(token.id),
      trader: trade.trader,
      side: trade.side,
      token_amount: trade.token_amount,
      quote_amount: trade.hood_amount,
      price_quote: price,
      price_usd: price,
      volume_usd: trade.hood_amount,
      block_number: 0,
      block_time: Date.now(),
      tx_hash: `curve:${trade.id}`,
      log_index: 0,
    });
  } catch {
    // Market-data mirroring is best-effort — a failure here must not fail the trade.
  }
}