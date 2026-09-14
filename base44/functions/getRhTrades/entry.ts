// Read API: recent normalized trades for a tracked token.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { listBounded } from "../../shared/rhStore.js";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { tradeShape } from "../../shared/rhShape.js";
import { blockNumber } from "../../shared/rhRpc.js";
import { getRefPrice, getTokenRecord } from "../../shared/rhStore.js";
import { loadSwapPools } from "../../shared/rhSwapPools.js";
import { readPoolSwaps } from "../../shared/rhPoolSwaps.js";

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
    if (body.source === "onchain") {
      const before = body.before_block;
      if (before !== undefined && (!Number.isSafeInteger(before) || before < 0)) {
        return Response.json({ error: "before_block must be a non-negative integer" }, { status: 400 });
      }
      const token = await getTokenRecord(db, address);
      if (!token) return Response.json({ error: "Token is not tracked" }, { status: 404 });
      const head = await blockNumber();
      const to = before === undefined ? head : Math.min(head, before - 1);
      const from = Math.max(0, to - 999);
      const pools = await loadSwapPools(db, address, await getRefPrice(db, "ETH"));
      const trades = await readPoolSwaps(pools, from, to);
      return Response.json({ trades: trades.reverse(), source: "onchain-pools", pool_count: pools.length,
        scanned_from: from, scanned_to: to, head_block: head,
        next_before_block: from > 0 && pools.length ? from : null });
    }
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 1000);
    const beforeBlock = Math.max(0, Math.floor(Number(body.before_block) || 0));
    const query = { token_address: address };
    if (beforeBlock) query.block_number = { $lt: beforeBlock };
    const trades = await listBounded(db, "RhTrade", query, "-block_number", limit);
    const oldest = trades[trades.length - 1]?.block_number || 0;

    return Response.json({
      trades: trades.map(tradeShape),
      next_before_block: trades.length === limit && oldest > 0 ? oldest : null,
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}