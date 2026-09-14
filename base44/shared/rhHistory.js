import { rpc, rpcBatch, toNum, blockTimes, CHAIN_ID } from "./rhRpc.js";
import { parseSwapLog, SWAP_TOPIC_BY_VENUE } from "./rhVenues.js";
import { isUsableTrade } from "./rhMarket.js";
import { isStable } from "./rhConstants.js";
import { insertNewByUid, getRefPrice } from "./rhStore.js";
import { rialtoTrades } from "./rhRialto.js";

const quoteUsdValue = (symbol, ethUsd) => isStable(symbol) ? 1 : /^(WETH|ETH)$/i.test(symbol || "") ? ethUsd : 0;

export async function backfillRhHistory(db, pageSize = 50) {
  const tokens = await db.entities.RhToken.filter({ tracked: true });
  const ethUsd = await getRefPrice(db, "ETH");
  const summary = [];

  for (const token of tokens) {
    const scope = `history:${token.address}`;
    const [state] = await db.entities.RhCursor.filter({ scope });
    if (state?.complete) {
      summary.push({ token: token.address, complete: true, indexed: 0 });
      continue;
    }

    const request = { fromBlock: "0x0", toBlock: "latest", contractAddresses: [token.address],
      category: ["erc20"], withMetadata: false, excludeZeroValue: false,
      maxCount: `0x${Math.min(Math.max(pageSize, 1), 100).toString(16)}`, order: "asc" };
    if (state?.page_key) request.pageKey = state.page_key;
    const page = await rpc("alchemy_getAssetTransfers", [request]);
    const transfers = page?.transfers || [];
    const hashes = [...new Set(transfers.map((t) => t.hash).filter(Boolean))];
    const receipts = (await rpcBatch("eth_getTransactionReceipt", hashes.map((hash) => [hash]))).filter(Boolean);
    const logs = receipts.flatMap((r) => r.logs || []);
    const pools = await db.entities.RhPool.filter({ token_address: token.address, active: true });
    let accepted = [];

    for (const pool of pools) {
      let raw = [];
      if (pool.venue === "rialto") raw = rialtoTrades(pool, logs);
      else {
        const topic = SWAP_TOPIC_BY_VENUE[pool.venue];
        for (const log of logs) {
          if (log.address.toLowerCase() !== pool.address || (log.topics?.[0] || "").toLowerCase() !== topic) continue;
          const parsed = parseSwapLog(log, pool);
          if (parsed) raw.push({ ...parsed, tx_hash: log.transactionHash, log_index: toNum(log.logIndex), block_number: toNum(log.blockNumber) });
        }
      }
      const times = raw.length ? await blockTimes(raw.map((t) => t.block_number)) : {};
      const quoteUsd = quoteUsdValue(pool.quote_symbol, ethUsd);
      accepted.push(...raw.map((t) => {
        const priceQuote = t.quote_amount / t.token_amount;
        return { uid: `${t.tx_hash}-${t.log_index}`, chain_id: CHAIN_ID, token_address: token.address,
          symbol: token.symbol, venue: pool.venue, pool: pool.address, trader: t.trader, side: t.side,
          token_amount: t.token_amount, quote_amount: t.quote_amount, price_quote: priceQuote,
          price_usd: priceQuote * quoteUsd, volume_usd: t.quote_amount * quoteUsd,
          block_number: t.block_number, block_time: times[t.block_number] || Date.now(),
          tx_hash: t.tx_hash, log_index: t.log_index };
      }).filter(isUsableTrade));
    }

    const indexed = await insertNewByUid(db, "RhTrade", accepted);
    const blocks = transfers.map((t) => toNum(t.blockNum)).filter(Boolean);
    const cursorData = { scope, last_block: blocks.length ? Math.max(...blocks) : state?.last_block || 0,
      page_key: page?.pageKey || "", complete: !page?.pageKey, updated_at: Date.now() };
    if (state) await db.entities.RhCursor.update(state.id, cursorData);
    else await db.entities.RhCursor.create(cursorData);
    summary.push({ token: token.address, transfers: transfers.length, receipts: receipts.length,
      decoded: accepted.length, indexed, complete: !page?.pageKey, last_block: cursorData.last_block });
  }
  return { source: "alchemy-indexed-transfers", summary };
}