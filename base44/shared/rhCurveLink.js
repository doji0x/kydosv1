// Links Kydos curve launches to their on-chain market record.
//
// A launched Token carries a ticker, not a contract address, so a graduated token is
// matched to its tracked RhToken by symbol.

export async function statsBySymbol(db) {
  const tokens = await db.entities.RhToken.filter({ tracked: true });
  const map = new Map();
  for (const t of tokens) {
    if (t.symbol) map.set(t.symbol.toLowerCase(), t);
  }
  return map;
}