// Discovers the pools trading each tracked token, purely from on-chain data.
//
// A single log sweep over recent blocks yields two kinds of candidate: any contract
// that emitted a DEX Swap event, and the busiest counterparties of a tracked token's
// Transfer events. Each candidate is then probed with eth_call for a pool interface.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { blockNumber, addrFromWord, usingFallback } from "../../shared/rhRpc.js";
import { rangeLogs, logsUnavailable } from "../../shared/rhLogs.js";
import { TOPIC, TRACKED_TOKENS } from "../../shared/rhConstants.js";
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
const SWAP_TOPICS = [TOPIC.UNIV2_SWAP, TOPIC.UNIV3_SWAP, TOPIC.UNIV4_SWAP];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const maxCandidates = Math.min(Number(body.max_candidates) || 12, 40);
    const maxReceipts = Math.min(Number(body.max_receipts) || 120, 400);
    const head = await blockNumber();

    // eth_getLogs can cover a wide window cheaply; block scanning cannot.
    const lookback = Number(body.lookback_blocks) || (logsUnavailable() ? 12 : 1200);
    const fromBlock = Math.max(head - lookback, 0);

    const only = body.token ? String(body.token).toLowerCase() : null;
    const seeds = only ? TRACKED_TOKENS.filter((t) => t.address === only) : TRACKED_TOKENS;
    const tracked = new Set(seeds.map((s) => s.address));

    // One sweep serves every tracked token.
    const sweep = await rangeLogs({
      fromBlock,
      toBlock: head,
      topics: [...SWAP_TOPICS, TOPIC.TRANSFER],
      maxReceipts,
    });

    // Contracts that emitted a Swap event are pools by definition.
    const swapEmitters = new Set(
      sweep.logs
        .filter((l) => SWAP_TOPICS.includes((l.topics?.[0] || "").toLowerCase()))
        .map((l) => l.address.toLowerCase()),
    );

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

      // Tally this token's Transfer counterparties — pools are by far the busiest.
      const counts = new Map();
      for (const log of sweep.logs) {
        if (log.address.toLowerCase() !== token) continue;
        if ((log.topics?.[0] || "").toLowerCase() !== TOPIC.TRANSFER) continue;
        for (const topic of [log.topics[1], log.topics[2]]) {
          if (!topic) continue;
          const addr = addrFromWord(topic);
          if (addr === ZERO || tracked.has(addr)) continue;
          counts.set(addr, (counts.get(addr) || 0) + 1);
        }
      }

      const existing = await db.entities.RhPool.filter({ token_address: token });
      const known = new Set(existing.map((p) => p.address));

      // Swap emitters first — they are certain pools — then busy counterparties.
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([addr]) => addr);
      const candidates = [...new Set([...ranked.filter((a) => swapEmitters.has(a)), ...ranked])]
        .filter((addr) => !known.has(addr))
        .slice(0, maxCandidates);

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
        transfers_seen: counts.size,
        candidates_probed: candidates.length,
        discovered,
        pool_count: pools.length,
      });
    }

    return Response.json({
      head_block: head,
      scanned_from: fromBlock,
      scanned_to: sweep.scanned_to,
      log_source: sweep.source,
      logs_seen: sweep.logs.length,
      using_public_fallback: usingFallback(),
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}