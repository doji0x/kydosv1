import { rpc, rpcBatch, toNum, CHAIN_ID } from "./rhRpc.js";
import { parseSwapLog, SWAP_TOPIC_BY_VENUE } from "./rhVenues.js";
import { isUsableTrade } from "./rhMarket.js";
import { quoteUsdValue } from "./rhConstants.js";
import { insertNewByUid, getRefPrice } from "./rhStore.js";
import { rialtoTrades } from "./rhRialto.js";

async function loadReceiptLogs(transfers) {
  const hashes = [...new Set(transfers.map((transfer) => transfer.hash).filter(Boolean))];
  const batches = [];
  for (let i = 0; i < hashes.length; i += 200) {
    batches.push(rpcBatch("eth_getTransactionReceipt", hashes.slice(i, i + 200).map((hash) => [hash])));
  }
  const receipts = (await Promise.all(batches)).flat().filter(Boolean);
  return { receipts, logs: receipts.flatMap((receipt) => receipt.logs || []) };
}

async function saveCursor(db, scope, state, page, transfers) {
  const blocks = transfers.map((transfer) => toNum(transfer.blockNum)).filter(Boolean);
  const cursorData = { scope, last_block: blocks.length ? Math.max(...blocks) : state?.last_block || 0,
    page_key: page?.pageKey || "", complete: !page?.pageKey, updated_at: Date.now() };
  const [latestState] = await db.entities.RhCursor.filter({ scope });
  if (!state || latestState?.page_key === state.page_key) {
    if (latestState) await db.entities.RhCursor.update(latestState.id, cursorData);
    else await db.entities.RhCursor.create(cursorData);
  }
  return cursorData;
}

async function backfillPoolDirection(db, token, pool, direction, pageSize, ethUsd) {
  const scope = `history-pool:${token.address}:${pool.address}:${direction}`;
  const [state] = await db.entities.RhCursor.filter({ scope });
  if (state?.complete) return { transfers: 0, receipts: 0, decoded: 0, indexed: 0 };

  const request = { fromBlock: "0x0", toBlock: "latest", contractAddresses: [token.address],
    category: ["erc20"], withMetadata: true, excludeZeroValue: false,
    maxCount: `0x${Math.min(Math.max(pageSize, 1), 1000).toString(16)}`, order: "asc",
    [direction === "in" ? "toAddress" : "fromAddress"]: pool.address };
  if (state?.page_key) request.pageKey = state.page_key;
  const page = await rpc("alchemy_getAssetTransfers", [request]);
  const transfers = page?.transfers || [];
  const { receipts, logs } = await loadReceiptLogs(transfers);
  const timeByHash = new Map(transfers.map((transfer) =>
    [transfer.hash, Date.parse(transfer.metadata?.blockTimestamp || "")]).filter(([, time]) => Number.isFinite(time)));

  let raw = [];
  if (pool.venue === "rialto") raw = rialtoTrades(pool, logs);
  else {
    const topic = SWAP_TOPIC_BY_VENUE[pool.venue];
    for (const log of logs) {
      if (String(log.address).toLowerCase() !== pool.address || (log.topics?.[0] || "").toLowerCase() !== topic) continue;
      const parsed = parseSwapLog(log, pool);
      if (parsed) raw.push({ ...parsed, tx_hash: log.transactionHash, log_index: toNum(log.logIndex), block_number: toNum(log.blockNumber) });
    }
  }

  const quoteUsd = quoteUsdValue(pool.quote_address, ethUsd);
  const accepted = raw.map((trade) => {
    const priceQuote = trade.quote_amount / trade.token_amount;
    return { uid: `${trade.tx_hash}-${trade.log_index}`, chain_id: CHAIN_ID, token_address: token.address,
      symbol: token.symbol, venue: pool.venue, pool: pool.address, trader: trade.trader, side: trade.side,
      token_amount: trade.token_amount, quote_amount: trade.quote_amount, price_quote: priceQuote,
      price_usd: priceQuote * quoteUsd, volume_usd: trade.quote_amount * quoteUsd,
      block_number: trade.block_number, block_time: timeByHash.get(trade.tx_hash) || Date.now(),
      tx_hash: trade.tx_hash, log_index: trade.log_index };
  }).filter(isUsableTrade);
  const indexed = await insertNewByUid(db, "RhTrade", accepted);
  await saveCursor(db, scope, state, page, transfers);
  return { transfers: transfers.length, receipts: receipts.length, decoded: accepted.length, indexed };
}

export async function backfillRhHistory(db, pageSize = 50, onlyToken = "") {
  const tracked = await db.entities.RhToken.filter({ tracked: true });
  const tokens = onlyToken ? tracked.filter((token) => token.address === onlyToken.toLowerCase()) : tracked;
  const ethUsd = await getRefPrice(db, "ETH");
  const summary = [];

  for (const token of tokens) {
    const pools = await db.entities.RhPool.filter({ token_address: token.address, active: true });
    const work = pools.flatMap((pool) => ["in", "out"].map((direction) => ({ pool, direction,
      scope: `history-pool:${token.address}:${pool.address}:${direction}` })));
    const scopes = work.map((item) => item.scope);
    const before = scopes.length ? await db.entities.RhCursor.filter({ scope: { $in: scopes } }) : [];
    const next = work.find((item) => !before.some((state) => state.scope === item.scope && state.complete));
    const totals = next
      ? await backfillPoolDirection(db, token, next.pool, next.direction, pageSize, ethUsd)
      : { transfers: 0, receipts: 0, decoded: 0, indexed: 0 };

    const states = scopes.length ? await db.entities.RhCursor.filter({ scope: { $in: scopes } }) : [];
    const complete = scopes.length > 0 && scopes.every((scope) => states.some((state) => state.scope === scope && state.complete));
    if (complete) {
      const rootScope = `history:${token.address}`;
      const [root] = await db.entities.RhCursor.filter({ scope: rootScope });
      const rootData = { scope: rootScope, last_block: Math.max(0, ...states.map((state) => state.last_block || 0)),
        page_key: "", complete: true, updated_at: Date.now() };
      if (root) await db.entities.RhCursor.update(root.id, rootData);
      else await db.entities.RhCursor.create(rootData);
    }
    summary.push({ token: token.address, ...totals, pools: pools.length, complete });
  }
  return { source: "alchemy-pool-transfers", summary };
}