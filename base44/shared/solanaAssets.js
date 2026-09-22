import { rpcCall } from './solanaIndex.js';
// Best-effort per-isolate cache, including failures; not a global cache.
const cache = new Map();
export async function cachedAsset(endpoint, mint) {
  const key = endpoint + ':' + mint, now = Date.now(), hit = cache.get(key);
  if (hit && hit.until > now) return hit.promise;
  const entry = { until: now + 60000, promise: null };
  entry.promise = rpcCall(endpoint, 'getAsset', { id: mint, options: { showFungible: true } })
    .then(asset => ({ asset, observedAt: Date.now() })).catch(() => ({ asset: null, observedAt: null }));
  cache.set(key, entry); if (cache.size > 256) cache.delete(cache.keys().next().value);
  return entry.promise;
}
