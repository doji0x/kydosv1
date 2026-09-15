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
  scaled,
  blockTimes,
  CHAIN_ID,
} from "../../shared/rhRpc.js";
import { rangeLogs } from "../../shared/rhLogs.js";
import { TOPIC, quoteUsdValue, LOG_SPAN } from "../../shared/rhConstants.js";
import { parseSwapLog, isVenueSwap } from "../../shared/rhVenues.js";
import { isUsableTrade } from "../../shared/rhMarket.js";
import {
  getCursor,
  setCursor,
  insertNewByUid,
  upsertToken,
  getRefPrice,
} from "../../shared/rhStore.js";
import { assertEngineCaller } from "../../shared/rhAuth.js";
import { rialtoTrades } from "../../shared/rhRialto.js";
import { backfillRhHistory } from "../../shared/rhHistory.js";

const SWAP_TOPICS = [TOPIC.UNIV2_SWAP, TOPIC.UNIV3_SWAP, TOPIC.UNIV4_SWAP, TOPIC.KYDOS_BUY, TOPIC.KYDOS_SELL];
const PROVENANCE_TOPICS = [TOPIC.POOL_REGISTERED, TOPIC.HOOK_FEE_COLLECTED, TOPIC.POOL_FEES_SWEPT];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    if (body.mode === "history") {
      const pages = Math.min(Math.max(Number(body.pages) || 1, 1), 25);
      const runs = [];
      for (let i = 0; i < pages; i++) {
        const run = await backfillRhHistory(db, Number(body.page_size) || 50, String(body.token || ""));
        runs.push(run);
        if (run.summary.length && run.summary.every((item) => item.complete)) break;
      }
      return Response.json({ source: "alchemy-indexed-transfers", pages: runs.length,
        summary: runs[runs.length - 1]?.summary || [],
        indexed: runs.reduce((sum, run) => sum + run.summary.reduce((n, item) => n + (item.indexed || 0), 0), 0) });
    }
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
          p.venue === "rialto" ? [p.address, p.token_address, p.quote_address] : p.venue === "uniswap_v4" ? [p.pool_manager, p.hook_address] : [p.address]
        ).filter(Boolean).map((a) => String(a).toLowerCase())
      ),
    ];
    const sweep = await rangeLogs({
      fromBlock,
      toBlock: targetBlock,
      addresses,
      topics: hasRialto ? [...SWAP_TOPICS, ...PROVENANCE_TOPICS, TOPIC.TRANSFER] : [...SWAP_TOPICS, ...PROVENANCE_TOPICS],
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

    const poolById = new Map(pools.filter((p) => p.venue === "uniswap_v4").map((p) => [p.address, p]));
    const provenance = sweep.logs.filter((log) => PROVENANCE_TOPICS.includes(String(log.topics?.[0] || "").toLowerCase())).map((log) => {
      const pool = poolById.get(String(log.topics?.[1] || "").toLowerCase());
      if (!pool) return null;
      const w = words(log.data);
      const eventTopic = String(log.topics[0]).toLowerCase();
      const registered = eventTopic === TOPIC.POOL_REGISTERED;
      const feeCollected = eventTopic === TOPIC.HOOK_FEE_COLLECTED;
      return {
        uid: `v4-${log.transactionHash}-${toNum(log.logIndex)}`, scope: registered ? "graduation" : "fee", target: `${log.transactionHash}-${toNum(log.logIndex)}`,
        token_address: pool.token_address, source_address: log.address.toLowerCase(), status: "VERIFIED",
        verification_method: "deterministic", severity: "SEV-5", recommended_action: "IGNORE", audited_at: Date.now(),
        original_value: registered
          ? { pool_id: pool.address, memecoin: w[0], quote_token: w[1], creator: w[2], liquidity_locked: true, tx_hash: log.transactionHash }
          : feeCollected
            ? { pool_id: pool.address, currency: w[0], fee_amount: scaled(toBig(w[1] || "0x0"), 18), creator_tax: scaled(toBig(w[2] || "0x0"), 18), tx_hash: log.transactionHash }
            : { pool_id: pool.address, protocol_amount: scaled(toBig(w[0] || "0x0"), 18), buyback_amount: scaled(toBig(w[1] || "0x0"), 18), creator_amount: scaled(toBig(w[2] || "0x0"), 18), tokens_locked: scaled(toBig(w[3] || "0x0"), 18), tx_hash: log.transactionHash }
      };
    }).filter(Boolean);
    if (provenance.length) await insertNewByUid(db, "RhAuditEvent", provenance);

    const summary = [];
    for (const pool of pools) {
      const quoteUsd = pool.launchpad_verified ? ethUsd : quoteUsdValue(pool.quote_address, ethUsd);
      let raw = [];

      if (pool.venue === "rialto") {
        raw = rialtoTrades(pool, sweep.logs);
      } else {
        const emitter = pool.venue === "uniswap_v4" ? pool.pool_manager : pool.address;
        for (const log of byAddress.get(emitter) || []) {
          if (!isVenueSwap(pool.venue, log.topics?.[0])) continue;
          if (pool.venue === "uniswap_v4" && String(log.topics?.[1] || "").toLowerCase() !== pool.address) continue;
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
            sqrt_price_x96: t.sqrt_price_x96,
            tick: t.tick,
            block_number: t.block_number,
            block_time: times[t.block_number] || Date.now(),
            tx_hash: t.tx_hash,
            log_index: t.log_index,
          };
        })
        .filter(isUsableTrade);

      const inserted = await insertNewByUid(db, "RhTrade", records);
      const latestV4 = pool.venue === "uniswap_v4" ? raw.filter((t) => t.sqrt_price_x96).at(-1) : null;
      if (latestV4) await db.entities.RhPool.update(pool.id, { sqrt_price_x96: latestV4.sqrt_price_x96, current_tick: latestV4.tick });
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