// The poller: reads swap logs for every discovered pool since its cursor and writes
// normalized RhTrade records. Uniswap V2/V3 are parsed from their Swap events; Rialto-style
// pools are reconstructed from paired ERC20 Transfer legs in the same transaction.
//
// All pools share ONE log sweep per cycle: the provider caps the block range per request,
// so cost is driven by the range, not by how many pools are tracked.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  blockNumber,
  toNum,
  toBig,
  words,
  addrFromWord,
  scaled,
  blockTimes,
  CHAIN_ID,
} from "../../shared/rhRpc.js";
import { rangeLogs } from "../../shared/rhLogs.js";
import { TOPIC, isStable, LOG_SPAN } from "../../shared/rhConstants.js";
import { parseSwapLog, SWAP_TOPIC_BY_VENUE } from "../../shared/rhVenues.js";
import {
  getCursor,
  setCursor,
  insertNewByUid,
  upsertToken,
  getRefPrice,
} from "../../shared/rhStore.js";
import { assertEngineCaller } from "../../shared/rhAuth.js";

const SWAP_TOPICS = [TOPIC.UNIV2_SWAP, TOPIC.UNIV3_SWAP];

// USD value of one quote token: stables 1:1, ETH from the reference price, anything
// else left unvalued so a memecoin-paired pool can't invent USD volume.
function quoteUsdValue(symbol, ethUsd) {
  if (isStable(symbol)) return 1;
  return /^(WETH|ETH)$/i.test(symbol || "") ? ethUsd : 0;
}

const transferLeg = (log, decimals) => ({
  from: addrFromWord(log.topics[1] || ""),
  to: addrFromWord(log.topics[2] || ""),
  value: scaled(toBig(words(log.data)[0] || "0x0"), decimals ?? 18),
});

// Reconstructs Rialto fills from the transfer legs already present in the sweep.
function rialtoTrades(pool, logs) {
  const quoteByTx = new Map();
  for (const log of logs) {
    if (log.address.toLowerCase() !== pool.quote_address) continue;
    const leg = transferLeg(log, pool.quote_decimals);
    if (leg.from !== pool.address && leg.to !== pool.address) continue;
    quoteByTx.set(log.transactionHash, (quoteByTx.get(log.transactionHash) || 0) + leg.value);
  }

  const out = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== pool.token_address) continue;
    const leg = transferLeg(log, pool.base_decimals);
    const inbound = leg.to === pool.address;
    const outbound = leg.from === pool.address;
    if (inbound === outbound) continue;

    const quoteAmount = quoteByTx.get(log.transactionHash) || 0;
    if (!leg.value || !quoteAmount) continue;

    out.push({
      side: outbound ? "buy" : "sell",
      token_amount: leg.value,
      quote_amount: quoteAmount,
      trader: outbound ? leg.to : leg.from,
      tx_hash: log.transactionHash,
      log_index: toNum(log.logIndex),
      block_number: toNum(log.blockNumber),
    });
  }
  return out;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const initialLookback = Math.min(Number(body.initial_lookback) || 300, 5000);
    const maxSpan = Math.min(Number(body.max_span) || 2000, 2000);
    // The chain produces blocks faster than one window covers, so a single invocation keeps
    // sweeping windows until it reaches the head or runs out of time.
    const budgetMs = Math.min(Number(body.budget_ms) || 50_000, 110_000);
    // The public RPC hard-caps eth_getLogs at a very narrow range; asking for more makes it
    // refuse logs entirely and fall back to block scanning, which is far slower.
    const logSpan = Math.min(Number(body.log_span) || LOG_SPAN, 500);
    // A cursor this far behind can never be replayed at the RPC's log throughput, so live
    // indexing jumps to the head instead of grinding forever in the past.
    const maxLag = Math.min(Number(body.max_lag) || 20_000, 500_000);
    const startedAt = Date.now();

    const head = await blockNumber();
    const ethUsd = await getRefPrice(db, "ETH");
    const pools = await db.entities.RhPool.filter({ active: true });
    if (!pools.length) return Response.json({ head_block: head, pools: 0, summary: [] });

    // One window covering every pool, starting at the furthest-behind cursor.
    const starts = [];
    for (const pool of pools) {
      const cursor = await getCursor(db, `swaps:${pool.address}`);
      starts.push(cursor ? cursor.last_block + 1 : Math.max(head - initialLookback, 0));
    }
    let fromBlock = Math.min(...starts);
    if (head - fromBlock > maxLag) fromBlock = Math.max(head - initialLookback, 0);
    if (fromBlock > head) {
      return Response.json({ head_block: head, pools: pools.length, up_to_date: true, summary: [] });
    }

    const firstFrom = fromBlock;
    let scannedTo = fromBlock - 1;
    let windows = 0;
    let logsSeen = 0;
    let summary = [];

    while (fromBlock <= head && Date.now() - startedAt < budgetMs) {
      const window = await indexWindow(fromBlock, Math.min(head, fromBlock + maxSpan - 1));
      scannedTo = window.scannedTo;
      logsSeen += window.logsSeen;
      summary = window.summary;
      windows += 1;
      fromBlock = window.scannedTo + 1;
    }

    return Response.json({
      head_block: head,
      from_block: firstFrom,
      to_block: scannedTo,
      behind: head - scannedTo,
      windows,
      logs_seen: logsSeen,
      eth_usd: ethUsd,
      pools: pools.length,
      summary,
    });

    async function indexWindow(fromBlock: number, targetBlock: number) {
    const hasRialto = pools.some((p) => p.venue === "rialto");
    // Ask the node only for the contracts we care about — pools, plus the token/quote
    // contracts whose Transfer legs reconstruct Rialto fills. Without this the sweep drags
    // back every swap on the chain and can never keep pace with the head.
    const addresses = [
      ...new Set(
        pools.flatMap((p) =>
          p.venue === "rialto" ? [p.address, p.token_address, p.quote_address] : [p.address]
        ).filter(Boolean).map((a) => String(a).toLowerCase())
      ),
    ];
    const sweep = await rangeLogs({
      fromBlock,
      toBlock: targetBlock,
      addresses,
      topics: hasRialto ? [...SWAP_TOPICS, TOPIC.TRANSFER] : SWAP_TOPICS,
      // With an address filter the response is small, so the node tolerates a far wider
      // range per call than the unfiltered 10-block crawl.
      span: logSpan,
    });
    const scannedTo = sweep.scanned_to;

    const byAddress = new Map();
    for (const log of sweep.logs) {
      const addr = log.address.toLowerCase();
      if (!byAddress.has(addr)) byAddress.set(addr, []);
      byAddress.get(addr).push(log);
    }

    const summary = [];
    for (const pool of pools) {
      const quoteUsd = quoteUsdValue(pool.quote_symbol, ethUsd);
      let raw = [];

      if (pool.venue === "rialto") {
        raw = rialtoTrades(pool, sweep.logs);
      } else {
        const topic = SWAP_TOPIC_BY_VENUE[pool.venue];
        for (const log of byAddress.get(pool.address) || []) {
          if ((log.topics?.[0] || "").toLowerCase() !== topic) continue;
          const parsed = parseSwapLog(log, pool);
          if (!parsed) continue;
          raw.push({
            ...parsed,
            tx_hash: log.transactionHash,
            log_index: toNum(log.logIndex),
            block_number: toNum(log.blockNumber),
          });
        }
      }

      const times = raw.length ? await blockTimes(raw.map((t) => t.block_number)) : {};
      const records = raw
        .filter((t) => t.token_amount && t.quote_amount)
        .map((t) => {
          const priceQuote = t.quote_amount / t.token_amount;
          return {
            uid: `${t.tx_hash}-${t.log_index}`,
            chain_id: CHAIN_ID,
            token_address: pool.token_address,
            venue: pool.venue,
            pool: pool.address,
            trader: t.trader,
            side: t.side,
            token_amount: t.token_amount,
            quote_amount: t.quote_amount,
            price_quote: priceQuote,
            price_usd: priceQuote * quoteUsd,
            volume_usd: t.quote_amount * quoteUsd,
            block_number: t.block_number,
            block_time: times[t.block_number] || Date.now(),
            tx_hash: t.tx_hash,
            log_index: t.log_index,
          };
        });

      const inserted = await insertNewByUid(db, "RhTrade", records);
      await setCursor(db, `swaps:${pool.address}`, scannedTo);
      await upsertToken(db, pool.token_address, { last_indexed_block: scannedTo });

      summary.push({
        pool: pool.address,
        venue: pool.venue,
        quote: pool.quote_symbol,
        parsed: records.length,
        indexed: inserted,
      });
    }

      return { scannedTo, logsSeen: sweep.logs.length, summary };
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}