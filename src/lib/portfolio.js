import { quoteSell } from "@/lib/curve";

// Average-cost accounting over a trader's fills, valued at the live curve.
export function buildPortfolio(trades, tokensById) {
  const byToken = new Map();
  for (const t of trades) {
    const g = byToken.get(t.token_id) || { token_id: t.token_id, ticker: t.ticker, bought: 0, sold: 0, hoodIn: 0, hoodOut: 0 };
    if (t.side === "buy") { g.bought += t.token_amount || 0; g.hoodIn += t.hood_amount || 0; }
    else { g.sold += t.token_amount || 0; g.hoodOut += t.hood_amount || 0; }
    byToken.set(t.token_id, g);
  }

  const positions = [];
  for (const g of byToken.values()) {
    const token = tokensById[g.token_id];
    const avgCost = g.bought > 0 ? g.hoodIn / g.bought : 0;
    const qty = Math.max(0, g.bought - g.sold);
    const cost = avgCost * qty;
    const value = token && qty > 0 ? quoteSell(token, qty) : 0;
    const realized = g.hoodOut - avgCost * Math.min(g.sold, g.bought);
    positions.push({
      ...g, token, qty, avgCost, cost, value, realized,
      unrealized: value - cost,
      pct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    });
  }
  positions.sort((a, b) => b.value - a.value || b.realized - a.realized);

  const sum = (k) => positions.reduce((n, p) => n + p[k], 0);
  const cost = sum("cost");
  const value = sum("value");
  const realized = sum("realized");
  const pnl = value - cost + realized;
  const invested = sum("hoodIn");
  return {
    positions,
    open: positions.filter((p) => p.qty > 0),
    value, cost, realized, pnl, invested,
    unrealized: value - cost,
    pct: invested > 0 ? (pnl / invested) * 100 : 0,
  };
}