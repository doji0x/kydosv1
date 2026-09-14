// Live tick source for the real-time chart.
//
// The browser cannot subscribe to the chain itself: the public RPC refuses websocket
// upgrades, and our provider's ws URL embeds an API key that must never reach a client.
// So this endpoint is the stream — the client passes the last block it saw and gets back
// every real swap decoded since, plus live pool spot, so it can roll 1s/5s/15s bars.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { blockNumber, blockTimes } from "../../shared/rhRpc.js";
import { TOPIC, isStable } from "../../shared/rhConstants.js";
import { rangeLogs } from "../../shared/rhLogs.js";
import { parseSwapLog } from "../../shared/rhVenues.js";
import { spotPriceQuote } from "../../shared/rhSpot.js";
import { getRefPrice } from "../../shared/rhStore.js";
import { assertApiCaller } from "../../shared/rhApiKey.js";

const SWAP_TOPIC = {
  uniswap_v2: TOPIC.UNIV2_SWAP,
  uniswap_v3: TOPIC.UNIV3_SWAP,
};

// ~10 blocks/second on this chain, so a 1s poll only needs a short window. Capped so a
// client returning after a long pause resyncs to the head instead of scanning forever.
const MAX_WINDOW = 40;
// A first-load bootstrap reaches much further back so a 1s/5s/15s chart opens with real
// history. 6000 blocks is ~10 minutes of this chain, read in wide getLogs chunks.
const MAX_BOOTSTRAP = 6000;
const BOOTSTRAP_SPAN = 750;

function quoteUsdValue(symbol, ethUsd) {
  if (isStable(symbol)) return 1;
  return /^(WETH|ETH)$/i.test(symbol || "") ? ethUsd : 0;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertApiCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const address = String(body.address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      return Response.json({ error: "A valid token address is required" }, { status: 400 });
    }
    const sinceBlock = Math.max(0, Math.floor(Number(body.since_block) || 0));
    const windowBlocks = Math.min(Math.max(Math.floor(Number(body.window_blocks) || 0), 0), MAX_BOOTSTRAP);

    const [token] = await db.entities.RhToken.filter({ address });
    if (!token) return Response.json({ error: "Token is not tracked" }, { status: 404 });

    const ethUsd = await getRefPrice(db, "ETH");
    const all = await db.entities.RhPool.filter({ token_address: address, active: true });

    // Only pools with a decodable swap event and a USD-valued quote can produce a tick.
    const pools = all
      .filter((p) => SWAP_TOPIC[p.venue] && quoteUsdValue(p.quote_symbol, ethUsd) > 0)
      .map((p) => ({
        address: p.address,
        venue: p.venue,
        base_is_token0: !!p.base_is_token0,
        base_decimals: p.base_decimals ?? 18,
        quote_decimals: p.quote_decimals ?? 18,
        quote_symbol: p.quote_symbol || null,
        quote_usd: quoteUsdValue(p.quote_symbol, ethUsd),
        liquidity_usd: p.liquidity_usd || 0,
      }))
      .sort((a, b) => b.liquidity_usd - a.liquidity_usd);

    const head = await blockNumber();
    const trades = [];
    let scannedFrom = head;
    let scannedTo = head;

    if ((sinceBlock || windowBlocks) && pools.length) {
      const from = sinceBlock
        ? Math.min(sinceBlock, head) + 1
        : Math.max(0, head - windowBlocks + 1);
      const to = sinceBlock ? Math.min(head, from + MAX_WINDOW - 1) : head;
      scannedFrom = from;
      if (from <= head) {
        const byAddress = new Map(pools.map((p) => [p.address, p]));
        const { logs, times, scanned_to } = await rangeLogs({
          fromBlock: from,
          toBlock: to,
          addresses: pools.map((p) => p.address),
          topics: [...new Set(pools.map((p) => SWAP_TOPIC[p.venue]))],
          maxReceipts: 120,
          span: sinceBlock ? undefined : BOOTSTRAP_SPAN,
        });

        scannedTo = scanned_to;
        const completeLogs = logs.filter((log) => Number(BigInt(log.blockNumber)) <= scannedTo);
        const missingTimes = [...new Set(completeLogs.map((log) => Number(BigInt(log.blockNumber))))].filter((bn) => !times[bn]);
        Object.assign(times, await blockTimes(missingTimes));
        for (const log of completeLogs) {
          const pool = byAddress.get((log.address || "").toLowerCase());
          if (!pool) continue;
          if ((log.topics?.[0] || "").toLowerCase() !== SWAP_TOPIC[pool.venue]) continue;
          const parsed = parseSwapLog(log, pool);
          if (!parsed) continue;

          const priceQuote = parsed.quote_amount / parsed.token_amount;
          const priceUsd = priceQuote * pool.quote_usd;
          if (!priceUsd || !isFinite(priceUsd)) continue;

          const bn = log.blockNumber ? Number(BigInt(log.blockNumber)) : head;
          trades.push({
            side: parsed.side,
            trader: parsed.trader,
            token_amount: parsed.token_amount,
            quote_amount: parsed.quote_amount,
            price_quote: priceQuote,
            price_usd: priceUsd,
            volume_usd: parsed.quote_amount * pool.quote_usd,
            pool: pool.address,
            venue: pool.venue,
            block_number: bn,
            block_time: times[bn],
            tx_hash: log.transactionHash || null,
            log_index: log.logIndex ? Number(BigInt(log.logIndex)) : 0,
          });
        }
        trades.sort((a, b) => a.block_number - b.block_number || a.log_index - b.log_index);
      }
    }

    // Live spot from the deepest pool keeps the chart moving between swaps.
    const deepest = pools[0];
    let priceQuote = token.price_quote || 0;
    let priceUsd = token.price_usd || 0;
    let priceSource = "indexed";
    const lastTrade = trades[trades.length - 1];
    // A bootstrap can return trades minutes old — those are history, not the live price.
    if (lastTrade && head - lastTrade.block_number <= MAX_WINDOW) {
      const last = lastTrade;
      priceQuote = last.price_quote;
      priceUsd = last.price_usd;
      priceSource = "live_swap";
    } else if (deepest) {
      const spot = await spotPriceQuote(deepest).catch(() => null);
      if (spot && isFinite(spot) && spot > 0) {
        priceQuote = spot;
        priceUsd = spot * deepest.quote_usd;
        priceSource = "pool_spot";
      }
    }

    return Response.json({
      address,
      symbol: token.symbol,
      chain_id: 4663,
      head_block: head,
      scanned_from: scannedFrom,
      scanned_to: scannedTo,
      pool_count: pools.length,
      trades,
      price_usd: priceUsd,
      price_quote: priceQuote,
      price_source: priceSource,
      server_time: Date.now(),
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}