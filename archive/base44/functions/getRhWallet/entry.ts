// Public API: a wallet's positions and PnL across every tracked token, computed from
// indexed balances plus that wallet's normalized trade history.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertApiCaller } from "../../shared/rhApiKey.js";
import { positionFromTrades, markToMarket } from "../../shared/rhPnl.js";
import { listBounded } from "../../shared/rhStore.js";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertApiCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    const wallet = String(body.address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
      return Response.json({ error: "A valid wallet address is required" }, { status: 400 });
    }

    const trades = await listBounded(db, "RhTrade", { trader: wallet }, "-block_time", 3000);
    const balances = await db.entities.RhBalance.filter({ wallet }, "-balance", 500);

    const addresses = [
      ...new Set([...trades.map((t) => t.token_address), ...balances.map((b) => b.token_address)]),
    ].filter(Boolean);
    if (!addresses.length) {
      return Response.json({
        wallet,
        positions: [],
        totals: { value_usd: 0, cost_basis_usd: 0, unrealized_pnl: 0, realized_pnl: 0, total_pnl: 0 },
        source: "kydos-indexer",
      });
    }

    const tokens = await db.entities.RhToken.filter({ address: { $in: addresses } });
    const tokenBy = new Map(tokens.map((t) => [t.address, t]));
    const balanceBy = new Map(balances.map((b) => [b.token_address, b.balance || 0]));

    const positions = [];
    const totals = { value_usd: 0, cost_basis_usd: 0, unrealized_pnl: 0, realized_pnl: 0 };

    for (const address of addresses) {
      const token = tokenBy.get(address);
      const position = positionFromTrades(trades.filter((t) => t.token_address === address));
      const marked = markToMarket(position, balanceBy.get(address), token?.price_usd || 0);
      // Fully exited and never held — still worth reporting for its realized PnL.
      if (!marked.balance && !position.realized_pnl && !position.bought) continue;

      positions.push({
        token: address,
        symbol: token?.symbol || null,
        name: token?.name || null,
        price_usd: token?.price_usd || 0,
        balance: marked.balance,
        value_usd: marked.value_usd,
        avg_cost_usd: position.avg_cost,
        cost_basis_usd: marked.cost_basis_usd,
        unrealized_pnl: marked.unrealized_pnl,
        unrealized_pct: marked.unrealized_pct,
        realized_pnl: position.realized_pnl,
        total_pnl: marked.unrealized_pnl + position.realized_pnl,
        bought: position.bought,
        sold: position.sold,
        invested_usd: position.cost_total,
        proceeds_usd: position.proceeds_total,
      });

      totals.value_usd += marked.value_usd;
      totals.cost_basis_usd += marked.cost_basis_usd;
      totals.unrealized_pnl += marked.unrealized_pnl;
      totals.realized_pnl += position.realized_pnl;
    }

    positions.sort((a, b) => b.value_usd - a.value_usd);

    return Response.json({
      wallet,
      positions,
      totals: { ...totals, total_pnl: totals.unrealized_pnl + totals.realized_pnl },
      source: "kydos-indexer",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}