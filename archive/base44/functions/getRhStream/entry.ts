// Live tick source for the real-time chart.
//
// The browser cannot subscribe to the chain itself: the public RPC refuses websocket
// upgrades, and our provider's ws URL embeds an API key that must never reach a client.
// So this endpoint is the stream — the client passes the last block it saw and gets back
// every real swap decoded since, plus live pool spot, so it can roll 1s/5s/15s bars.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { blockNumber, rpc } from "../../shared/rhRpc.js";
import { loadSwapPools } from "../../shared/rhSwapPools.js";
import { readPoolSwaps } from "../../shared/rhPoolSwaps.js";
import { spotPriceQuote } from "../../shared/rhSpot.js";
import { getRefPrice } from "../../shared/rhStore.js";
import { assertApiCaller } from "../../shared/rhApiKey.js";

// Bounded, provider-compatible scans; clients drain any backlog without skipping blocks.
const MAX_WINDOW = 400;
const MAX_BOOTSTRAP = 1000;

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
    // Backward paging: scan a window that ENDS at to_block, for pulling older chart history.
    const toBlock = Math.max(0, Math.floor(Number(body.to_block) || 0));

    const [token] = await db.entities.RhToken.filter({ address });
    if (!token) return Response.json({ error: "Token is not tracked" }, { status: 404 });

    const ethUsd = await getRefPrice(db, "ETH");
    const pools = await loadSwapPools(db, address, ethUsd);

    const head = await blockNumber();
    let scannedFrom = head;
    let scannedTo = head;
    let trades = [];
    if ((sinceBlock || windowBlocks || toBlock) && pools.length) {
      if (toBlock) {
        scannedTo = Math.min(toBlock, head);
        scannedFrom = Math.max(0, scannedTo - (windowBlocks || MAX_BOOTSTRAP) + 1);
      } else {
        scannedFrom = sinceBlock ? Math.min(sinceBlock, head) + 1 : Math.max(0, head - windowBlocks + 1);
        scannedTo = sinceBlock ? Math.min(head, scannedFrom + MAX_WINDOW - 1) : head;
      }
      trades = await readPoolSwaps(pools, scannedFrom, scannedTo);
    }

    // Live spot from the deepest pool keeps the chart moving between swaps.
    const deepest = pools.find((p) => p.quote_usd > 0);
    let priceQuote = token.price_quote || 0;
    let priceUsd = token.price_usd || 0;
    let priceSource = "indexed";
    const lastTrade = trades[trades.length - 1];
    // A bootstrap can return trades minutes old — those are history, not the live price.
    if (lastTrade?.price_usd > 0 && head - lastTrade.block_number <= 40) {
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
      chain_id: Number(BigInt(await rpc("eth_chainId"))),
      head_block: head,
      scanned_from: scannedFrom,
      scanned_to: scannedTo,
      blocks_behind: Math.max(0, head - scannedTo),
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