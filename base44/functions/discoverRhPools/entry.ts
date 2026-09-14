// Discovers the pools trading each tracked token, purely from on-chain data:
// tallies the busiest Transfer counterparties, then probes each for a DEX pool interface.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { blockNumber, getLogs, hex, addrFromWord, usingFallback } from "../../shared/rhRpc.js";
import { TOPIC, TRACKED_TOKENS, MAX_BLOCK_SPAN, FALLBACK_BLOCK_SPAN } from "../../shared/rhConstants.js";
import {
  inspectPool,
  erc20Decimals,
  erc20Symbol,
  erc20Name,
  erc20TotalSupply,
} from "../../shared/rhErc20.js";
import { upsertToken } from "../../shared/rhStore.js";
import { assertEngineCaller } from "../../shared/rhAuth.js";

const ZERO = "0x" + "0".repeat(40);

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const lookback = Math.min(Number(body.lookback_blocks) || 3000, 20000);
    const maxCandidates = Math.min(Number(body.max_candidates) || 15, 40);

    const head = await blockNumber();
    const span = usingFallback() ? FALLBACK_BLOCK_SPAN : MAX_BLOCK_SPAN;
    const only = body.token ? String(body.token).toLowerCase() : null;
    const seeds = only ? TRACKED_TOKENS.filter((t) => t.address === only) : TRACKED_TOKENS;
    const results = [];

    for (const seed of seeds) {
      const token = seed.address;
      const decimals = await erc20Decimals(token);
      const [symbol, name, supply] = await Promise.all([
        erc20Symbol(token),
        erc20Name(token),
        erc20TotalSupply(token, decimals),
      ]);

      await upsertToken(db, token, {
        symbol: symbol || seed.symbol,
        name: name || seed.name,
        decimals,
        total_supply: supply || 0,
        tracked: true,
      });

      // Tally Transfer counterparties — pools are by far the busiest.
      const counts = new Map();
      for (let from = Math.max(head - lookback, 0); from <= head; from += span) {
        const to = Math.min(from + span - 1, head);
        const logs = await getLogs({
          address: token,
          topics: [TOPIC.TRANSFER],
          fromBlock: hex(from),
          toBlock: hex(to),
        });
        for (const log of logs) {
          for (const topic of [log.topics[1], log.topics[2]]) {
            if (!topic) continue;
            const addr = addrFromWord(topic);
            if (addr === ZERO) continue;
            counts.set(addr, (counts.get(addr) || 0) + 1);
          }
        }
      }

      const existing = await db.entities.RhPool.filter({ token_address: token });
      const known = new Set(existing.map((p) => p.address));
      const candidates = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxCandidates)
        .map(([addr]) => addr)
        .filter((addr) => !known.has(addr));

      const discovered = [];
      for (const candidate of candidates) {
        const info = await inspectPool(candidate);
        if (!info) continue;
        if (info.token0 !== token && info.token1 !== token) continue;

        const baseIsToken0 = info.token0 === token;
        const quote = baseIsToken0 ? info.token1 : info.token0;
        const [quoteDecimals, quoteSymbol] = await Promise.all([
          erc20Decimals(quote),
          erc20Symbol(quote),
        ]);

        await db.entities.RhPool.create({
          address: candidate,
          token_address: token,
          venue: info.venue,
          token0: info.token0,
          token1: info.token1,
          base_is_token0: baseIsToken0,
          quote_address: quote,
          quote_symbol: quoteSymbol || "",
          quote_decimals: quoteDecimals,
          base_decimals: decimals,
          fee: info.fee,
          active: true,
          discovered_at: Date.now(),
        });
        discovered.push({ address: candidate, venue: info.venue, quote: quoteSymbol });
      }

      const pools = await db.entities.RhPool.filter({ token_address: token, active: true });
      await upsertToken(db, token, { pool_count: pools.length, pools_synced_at: Date.now() });

      results.push({
        token,
        symbol: symbol || seed.symbol,
        candidates_probed: candidates.length,
        discovered,
        pool_count: pools.length,
      });
    }

    return Response.json({ head_block: head, using_public_fallback: usingFallback(), results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}