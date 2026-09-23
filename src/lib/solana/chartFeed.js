export const compareTrades = (a, b) => (a.slot - b.slot) || (a.transactionIndex - b.transactionIndex) || (a.eventIndex - b.eventIndex) || (a.blockTime - b.blockTime) || String(a.eventId || a.signature).localeCompare(String(b.eventId || b.signature));
export function mergeTrades(current, incoming) {
  const events = new Map(current.map(trade => [trade.eventId || trade.signature, trade]));
  incoming.forEach(trade => events.set(trade.eventId || trade.signature, trade));
  return [...events.values()].sort(compareTrades);
}
export function feedHealth({ now, lastSync, coverage, error }) {
  if (error) return 'Refresh failed';
  if (!lastSync) return 'Connecting';
  if (!coverage?.configured) return 'Indexing not configured';
  if (coverage.error) return 'Indexing needs attention';
  if (coverage.catchingUp) return 'Catching up';
  if (now - lastSync > 30000 || !coverage.indexedThrough || now - coverage.indexedThrough > 120000) return 'Updates delayed';
  return 'Synced';
}
