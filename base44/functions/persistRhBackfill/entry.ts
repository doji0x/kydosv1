// Write-back for the chart's client-side backfill.
//
// The browser decodes historical swaps off the chain to draw a full series. Without this
// endpoint that work is thrown away and every visitor re-scans the same blocks. Here the
// swaps land in RhTrade and the rolled bars in RhCandle, using the exact same uid dedupe
// keys as the indexer — so the store converges on one history no matter who filled it.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { INTERVALS, CHAIN_ID_DEFAULT } from "../../shared/rhConstants.js";
import { insertNewByUid, upsertByUid, getTokenRecord } from "../../shared/rhStore.js";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { backfillTradeRecords, backfillCandleRecords } from "../../shared/rhBackfillWrite.js";

const MAX_TRADES = 500;
const MAX_CANDLES = 200;

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
    // Only tracked tokens may be written, so a caller cannot seed arbitrary history.
    const token = await getTokenRecord(db, address);
    if (!token) return Response.json({ error: "Token is not tracked" }, { status: 404 });

    const trades = backfillTradeRecords(body.trades, address, token.symbol).slice(0, MAX_TRADES);
    const candles = backfillCandleRecords(body.candles, address).slice(0, MAX_CANDLES);

    const insertedTrades = await insertNewByUid(db, "RhTrade", trades);

    let writtenCandles = 0;
    for (const bar of candles) {
      await upsertByUid(db, "RhCandle", `${address}-${bar.interval}-${bar.bucket_start}`, bar);
      writtenCandles += 1;
    }

    return Response.json({
      address,
      trades_received: Array.isArray(body.trades) ? body.trades.length : 0,
      trades_accepted: trades.length,
      trades_inserted: insertedTrades,
      candles_written: writtenCandles,
      intervals: Object.keys(INTERVALS),
      chain_id: CHAIN_ID_DEFAULT,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}