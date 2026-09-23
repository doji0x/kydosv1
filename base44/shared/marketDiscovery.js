import { MARKET_CATALOG, MARKET_INTERVALS, MARKET_NETWORK, MARKET_SCHEMA, MARKET_SCOPE, snapshotStatus } from './marketCatalog.js';
import { emptyMarketToken, fetchMarketSnapshot, MarketProviderError, MAX_PAYLOAD_BYTES, sanitizeSnapshot } from './jupiterMarkets.js';

export function emptySnapshot() {
  return { schema: MARKET_SCHEMA, network: MARKET_NETWORK, source: 'Jupiter Tokens V2', fetchedAt: null, tokens: MARKET_CATALOG.map(emptyMarketToken), trending: Object.fromEntries(MARKET_INTERVALS.map(interval => [interval, []])) };
}
export async function latestSnapshot(entity, now = Date.now()) {
  const rows = await entity.filter({ scope: MARKET_SCOPE }, '-started_at', 5);
  for (const row of rows) {
    if (typeof row.payload_json !== 'string' || row.payload_json.length > MAX_PAYLOAD_BYTES) continue;
    try {
      const snapshot = sanitizeSnapshot(JSON.parse(row.payload_json), now);
      if (snapshot) return snapshot;
    } catch { /* Try the previous complete generation if a record is malformed. */ }
  }
  return null;
}
export async function readMarketDiscovery(entity, now = Date.now()) {
  const snapshot = await latestSnapshot(entity, now) || emptySnapshot();
  return { ...snapshot, status: snapshotStatus(snapshot.fetchedAt, now) };
}

// Platform service headers alone are not authorization: they exist on ordinary requests too.
export async function canRefreshMarkets(request, client, workerToken) {
  const supplied = request.headers.get('x-kydos-market-token');
  if (typeof workerToken === 'string' && workerToken.length >= 32 && supplied && supplied.length === workerToken.length) {
    let difference = 0;
    for (let i = 0; i < workerToken.length; i++) difference |= workerToken.charCodeAt(i) ^ supplied.charCodeAt(i);
    if (difference === 0) return true;
  }
  try {
    const user = await client.auth.me();
    return !!user?.id && user.disabled !== true && (user.role === 'admin' || user.is_service === true);
  } catch { return false; }
}

export function createMarketRefresher() {
  let pending;
  return async ({ entity, apiKey, now = Date.now, fetchImpl, pause }) => {
    if (pending) return pending;
    pending = (async () => {
      const startedAt = now(), previous = await latestSnapshot(entity, startedAt);
      if (previous && startedAt - previous.fetchedAt < 25_000) return { refreshed: false, fetchedAt: previous.fetchedAt };
      const snapshot = await fetchMarketSnapshot({ apiKey, now, fetchImpl, pause });
      const payload = JSON.stringify(snapshot);
      if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) throw new MarketProviderError('snapshot_size', 'Market snapshot exceeded the storage limit.');
      // Immutable generations work without unsupported unique constraints or atomic leases.
      await entity.create({ scope: MARKET_SCOPE, started_at: startedAt, fetched_at: snapshot.fetchedAt, payload_json: payload });
      try {
        const obsolete = await entity.filter({ scope: MARKET_SCOPE, fetched_at: { $lt: now() - 900_000 } }, 'started_at', 50);
        for (const row of obsolete) await entity.delete(row.id);
      } catch { /* Cleanup must not discard a successfully published snapshot. */ }
      return { refreshed: true, fetchedAt: snapshot.fetchedAt, tokenCount: snapshot.tokens.length };
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
