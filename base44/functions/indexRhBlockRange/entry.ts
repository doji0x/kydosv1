// The poller: reads swap logs for every discovered pool since its cursor and writes
// normalized RhTrade records. Uniswap V2/V3 are parsed from their Swap events; Rialto-style
// pools are reconstructed from paired ERC20 Transfer legs in the same transaction.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  blockNumber,
  getLogs,
  hex,
  toNum,
  toBig,
  words,
  addrFromWord,
  scaled,
  blockTimes,
  CHAIN_ID,
} from "../../shared/rhRpc.js";
import { TOPIC, MAX_BLOCK_SPAN, MAX_CATCHUP_SPAN, isStable } from "../../shared/rhConstants.js";
import { parseSwapLog, SWAP_TOPIC_BY_VENUE } from "../../shared/rhVenues.js";
import { getCursor, setCursor, insertNewByUid, upsertToken, getRefPrice } from "../../shared/rhStore.js";
import { assertEngineCaller } from "../../shared/rhAuth.js";

// Reconstructs Rialto fills: base-token legs touching the pool, priced by the quote leg
// transferred in the same transaction.
async function rialtoTrades(pool, fromBlock, toBlock) {
  const baseLogs = await getLogs({
    address: pool.token_address,
    topics: [TOPIC.TRANSFER],
    fromBlock: hex(fromBlock),
    toBlock: hex(toBlock),
  });
  const quoteLogs = pool.quote_address
    ? await getLogs({
        address: pool.quote_address,
        topics: [TOPIC.TRANSFER],
        fromBlock: hex(fromBlock),
        toBlock: hex(toBlock),
      })
    : [];

  const quoteByTx = new Map();
  for (const log of quoteLogs) {
    const from = addrFromWord(log.topics[1] || "");
    const to = addrFromWord(log.topics[2] || "");
    if (from !== pool.address && to !== pool.address) continue;
    const value = scaled(toBig(words(log.data)[0] || "0x0"), pool.quote_decimals ?? 18);
    quoteByTx.set(log.transactionHash, (quoteByTx.get(log.transactionHash) || 0) + value);
  }

  const out = [];
  for (const log of baseLogs) {
    const from = addrFromWord(log.topics[1] || "");
    const to = addrFromWord(log.topics[2] || "");
    const inbound = to === pool.address;
    const outbound = from === pool.address;
    if (inbound === outbound) continue;

    const tokenAmount = scaled(toBig(words(log.data)[0] || "0x0"), pool.base_decimals ?? 18);
    const quoteAmount = quoteByTx.get(log.transactionHash) || 0;
    if (!tokenAmount || !quoteAmount) continue;

    out.push({
      side: outbound ? "buy" : "sell",
      token_amount: tokenAmount,
      quote_amount: quoteAmount,
      trader: outbound ? to : from,
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
    const initialLookback = Math.min(Number(body.initial_lookback) || 1500, 20000);

    const head = await blockNumber();
    const ethUsd = await getRefPrice(db, "ETH");
    const pools = await db.entities.RhPool.filter({ active: true });
    const summary = [];

    for (const pool of pools) {
      const scope = `swaps:${pool.address}`;
      const cursor = await getCursor(db, scope);
      const fromBlock = cursor ? cursor.last_block + 1 : Math.max(head - initialLookback, 0);
      if (fromBlock > head) {
        summary.push({ pool: pool.address, venue: pool.venue, indexed: 0, up_to: head });
        continue;
      }
      const targetBlock = Math.min(head, fromBlock + MAX_CATCHUP_SPAN - 1);

      const quoteUsd = isStable(pool.quote_symbol) ? 1 : ethUsd;
      const raw = [];

      for (let start = fromBlock; start <= targetBlock; start += MAX_BLOCK_SPAN) {
        const end = Math.min(start + MAX_BLOCK_SPAN - 1, targetBlock);

        if (pool.venue === "rialto") {
          raw.push(...(await rialtoTrades(pool, start, end)));
          continue;
        }

        const topic = SWAP_TOPIC_BY_VENUE[pool.venue];
        const logs = await getLogs({
          address: pool.address,
          topics: [topic],
          fromBlock: hex(start),
          toBlock: hex(end),
        });
        for (const log of logs) {
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
      const records = raw.map((t) => {
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
      await setCursor(db, scope, targetBlock);
      await upsertToken(db, pool.token_address, { last_indexed_block: targetBlock });

      summary.push({
        pool: pool.address,
        venue: pool.venue,
        from: fromBlock,
        to: targetBlock,
        parsed: records.length,
        indexed: inserted,
        behind: head - targetBlock,
      });
    }

    return Response.json({ head_block: head, eth_usd: ethUsd, pools: pools.length, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}