// Position and PnL math, derived from a wallet's normalized trade history.
//
// Cost basis is a running average: buys add cost, sells realize the difference between
// proceeds and the average cost of the tokens sold. Whatever is still held is valued at
// the token's canonical price for unrealized PnL.

/**
 * @param {object[]} trades one wallet's trades for one token, any order
 * @returns {{bought, sold, cost_total, proceeds_total, realized_pnl, avg_cost, open_amount, open_cost}}
 */
export function positionFromTrades(trades) {
  const ordered = [...trades].sort((a, b) => (a.block_time || 0) - (b.block_time || 0));

  let amount = 0; // tokens still held per trade history
  let cost = 0; // cost basis of those tokens, USD
  let bought = 0;
  let sold = 0;
  let costTotal = 0;
  let proceedsTotal = 0;
  let realized = 0;

  for (const t of ordered) {
    const tokens = t.token_amount || 0;
    const usd = t.volume_usd || 0;
    if (!tokens) continue;

    if (t.side === "buy") {
      amount += tokens;
      cost += usd;
      bought += tokens;
      costTotal += usd;
    } else {
      const closing = Math.min(tokens, amount);
      const avg = amount > 0 ? cost / amount : 0;
      realized += usd - avg * closing;
      amount -= closing;
      cost -= avg * closing;
      sold += tokens;
      proceedsTotal += usd;
    }
  }

  return {
    bought,
    sold,
    cost_total: costTotal,
    proceeds_total: proceedsTotal,
    realized_pnl: realized,
    avg_cost: amount > 0 ? cost / amount : 0,
    open_amount: Math.max(amount, 0),
    open_cost: Math.max(cost, 0),
  };
}

/** Marks a position to market against the token's canonical price. */
export function markToMarket(position, balance, priceUsd) {
  const held = balance ?? position.open_amount;
  const value = held * (priceUsd || 0);
  // Value the actual on-chain balance using the basis per token we derived from trades.
  const basis = position.avg_cost ? held * position.avg_cost : position.open_cost;
  const unrealized = priceUsd ? value - basis : 0;
  return {
    balance: held,
    value_usd: value,
    cost_basis_usd: basis,
    unrealized_pnl: unrealized,
    unrealized_pct: basis ? (unrealized / basis) * 100 : 0,
  };
}