// Holder index: walks Transfer logs since its cursor and accumulates per-wallet balances
// into RhBalance, so holder counts and top holders come from Kydos-owned data.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { blockNumber, getLogs, hex, toNum, toBig, words, addrFromWord, scaled } from "../../shared/rhRpc.js";
import { TOPIC, MAX_BLOCK_SPAN, MAX_CATCHUP_SPAN } from "../../shared/rhConstants.js";
import { getCursor, setCursor } from "../../shared/rhStore.js";
import { assertEngineCaller } from "../../shared/rhAuth.js";

const ZERO = "0x" + "0".repeat(40);

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const initialLookback = Math.min(Number(body.initial_lookback) || 1500, 20000);

    const head = await blockNumber();
    const tokens = await db.entities.RhToken.filter({ tracked: true });
    const summary = [];

    for (const token of tokens) {
      const scope = `transfers:${token.address}`;
      const cursor = await getCursor(db, scope);
      const fromBlock = cursor ? cursor.last_block + 1 : Math.max(head - initialLookback, 0);
      if (fromBlock > head) continue;
      const targetBlock = Math.min(head, fromBlock + MAX_CATCHUP_SPAN - 1);

      const pools = await db.entities.RhPool.filter({ token_address: token.address });
      const poolSet = new Set(pools.map((p) => p.address));
      const decimals = token.decimals ?? 18;
      const deltas = new Map();

      for (let start = fromBlock; start <= targetBlock; start += MAX_BLOCK_SPAN) {
        const end = Math.min(start + MAX_BLOCK_SPAN - 1, targetBlock);
        const logs = await getLogs({
          address: token.address,
          topics: [TOPIC.TRANSFER],
          fromBlock: hex(start),
          toBlock: hex(end),
        });
        for (const log of logs) {
          const from = addrFromWord(log.topics[1] || "");
          const to = addrFromWord(log.topics[2] || "");
          const value = scaled(toBig(words(log.data)[0] || "0x0"), decimals);
          if (!value) continue;
          if (from && from !== ZERO) deltas.set(from, (deltas.get(from) || 0) - value);
          if (to && to !== ZERO) deltas.set(to, (deltas.get(to) || 0) + value);
        }
      }

      const wallets = [...deltas.keys()];
      let created = 0;
      let updated = 0;

      for (let i = 0; i < wallets.length; i += 100) {
        const chunk = wallets.slice(i, i + 100);
        const uids = chunk.map((w) => `${token.address}-${w}`);
        const existing = await db.entities.RhBalance.filter({ uid: { $in: uids } });
        const byUid = new Map(existing.map((r) => [r.uid, r]));

        const fresh = [];
        for (const wallet of chunk) {
          const uid = `${token.address}-${wallet}`;
          const delta = deltas.get(wallet) || 0;
          const row = byUid.get(uid);
          if (row) {
            await db.entities.RhBalance.update(row.id, {
              balance: Math.max((row.balance || 0) + delta, 0),
              updated_block: targetBlock,
            });
            updated += 1;
          } else {
            fresh.push({
              uid,
              token_address: token.address,
              wallet,
              balance: Math.max(delta, 0),
              is_pool: poolSet.has(wallet),
              updated_block: targetBlock,
            });
          }
        }
        if (fresh.length) {
          await db.entities.RhBalance.bulkCreate(fresh);
          created += fresh.length;
        }
      }

      await setCursor(db, scope, targetBlock);
      summary.push({
        symbol: token.symbol,
        from: fromBlock,
        to: targetBlock,
        wallets_touched: wallets.length,
        created,
        updated,
        behind: head - targetBlock,
      });
    }

    return Response.json({ head_block: head, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}