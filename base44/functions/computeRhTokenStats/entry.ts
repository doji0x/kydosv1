// Market engine: recomputes every published stat for each tracked token from indexed
// RhTrade records plus live pool reserves, then upserts the canonical RhToken record.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { isStable } from "../../shared/rhConstants.js";
import { v2Reserves, erc20BalanceOf } from "../../shared/rhErc20.js";
import { computeStats } from "../../shared/rhMarket.js";
import { listBounded, upsertToken, getRefPrice } from "../../shared/rhStore.js";
import { assertEngineCaller } from "../../shared/rhAuth.js";

async function poolLiquidityUsd(pool, ethUsd, tokenPriceUsd) {
  const quoteUsd = isStable(pool.quote_symbol) ? 1 : ethUsd;
  let reserveBase = null;
  let reserveQuote = null;

  if (pool.venue === "uniswap_v2") {
    const r = await v2Reserves(pool.address, pool.base_is_token0 ? pool.base_decimals : pool.quote_decimals, pool.base_is_token0 ? pool.quote_decimals : pool.base_decimals);
    if (r) {
      reserveBase = pool.base_is_token0 ? r.reserve0 : r.reserve1;
      reserveQuote = pool.base_is_token0 ? r.reserve1 : r.reserve0;
    }
  }
  if (reserveBase === null) {
    reserveBase = await erc20BalanceOf(pool.token_address, pool.address, pool.base_decimals ?? 18);
    reserveQuote = pool.quote_address
      ? await erc20BalanceOf(pool.quote_address, pool.address, pool.quote_decimals ?? 18)
      : 0;
  }

  const quoteSide = (reserveQuote || 0) * quoteUsd;
  const baseSide = (reserveBase || 0) * (tokenPriceUsd || 0);
  return { liquidity: quoteSide + baseSide, reserveBase: reserveBase || 0, reserveQuote: reserveQuote || 0 };
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44);
    if (denied) return denied;
    const db = base44.asServiceRole;

    const ethUsd = await getRefPrice(db, "ETH");
    const tokens = await db.entities.RhToken.filter({ tracked: true });
    const out = [];

    for (const token of tokens) {
      const trades = await listBounded(db, "RhTrade", { token_address: token.address }, "-block_time", 3000);
      const latestPrice = trades[0]?.price_usd || 0;

      const pools = await db.entities.RhPool.filter({ token_address: token.address, active: true });
      let liquidity = 0;
      for (const pool of pools) {
        const info = await poolLiquidityUsd(pool, ethUsd, latestPrice);
        liquidity += info.liquidity;
        await db.entities.RhPool.update(pool.id, {
          reserve_base: info.reserveBase,
          reserve_quote: info.reserveQuote,
          liquidity_usd: info.liquidity,
        });
      }

      const holders = await db.entities.RhBalance.filter({ token_address: token.address, is_pool: false });
      const holderCount = holders.filter((h) => (h.balance || 0) > 0).length;

      const stats = computeStats(trades, {
        totalSupply: token.total_supply,
        liquidityUsd: liquidity,
        refPriceUsd: ethUsd,
      });

      await upsertToken(db, token.address, {
        price_usd: stats.price_usd,
        price_quote: stats.price_quote,
        market_cap: stats.market_cap,
        fdv: stats.fdv,
        volume_24h: stats.volume_24h,
        liquidity_usd: stats.liquidity_usd,
        change_1h: stats.change_1h,
        change_6h: stats.change_6h,
        change_24h: stats.change_24h,
        buys_24h: stats.buys_24h,
        sells_24h: stats.sells_24h,
        trades_24h: stats.trades_24h,
        holder_count: holderCount,
        pool_count: pools.length,
        stats_updated_at: stats.stats_updated_at,
      });

      out.push({
        symbol: token.symbol,
        address: token.address,
        price_usd: stats.price_usd,
        volume_24h: stats.volume_24h,
        trades_24h: stats.trades_24h,
        liquidity_usd: stats.liquidity_usd,
        holders: holderCount,
        trades_considered: trades.length,
      });
    }

    return Response.json({ eth_usd: ethUsd, tokens: out });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}