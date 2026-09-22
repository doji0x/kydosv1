import { identifySolanaNetwork } from './solanaNetwork.js';
import { PROGRAM_ADDRESS, DECODER_VERSION } from './solanaProtocol.js';
import { decodeKydosTransaction, uniqueEvents } from './solanaEvents.js';
export async function rpcCall(endpoint, method, params = []) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Solana ${method} HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error || !Object.hasOwn(payload, 'result')) throw new Error(`Solana ${method} unavailable (${payload.error?.code || 'invalid response'})`);
  return payload.result;
}
export const readNetwork = async endpoint => identifySolanaNetwork(await rpcCall(endpoint, 'getGenesisHash'));
export async function persistEvents(entity, rows) {
  const unique = uniqueEvents(rows);
  if (!unique.length) return 0;
  const found = await entity.filter({ event_id: { $in: unique.map(row => row.event_id) } }, '-created_date', 1000);
  const seen = new Set(found.map(row => row.event_id)), additions = unique.filter(row => !seen.has(row.event_id));
  for (let offset = 0; offset < additions.length; offset += 100) await entity.bulkCreate(additions.slice(offset, offset + 100));
  // Base44 has no uniqueness constraint. Readers deduplicate physical duplicates
  // by event_id before volume/candle aggregation; run a single indexer writer.
  return additions.length;
}
export async function readRawPage({ rpc, chain, before, until, limit = 100 }) {
  const signatures = await rpc('getSignaturesForAddress', [PROGRAM_ADDRESS, { commitment: 'finalized', limit, ...(before ? { before } : {}), ...(until ? { until } : {}) }]);
  if (!Array.isArray(signatures)) throw new Error('Signature history unavailable');
  const blocks = new Map(), rows = [];
  const getBlock = slot => {
    if (!blocks.has(slot)) blocks.set(slot, rpc('getBlock', [slot, { commitment: 'finalized', transactionDetails: 'signatures', rewards: false, maxSupportedTransactionVersion: 0 }]));
    return blocks.get(slot);
  };
  for (let offset = 0; offset < signatures.length; offset += 4) {
    const group = await Promise.all(signatures.slice(offset, offset + 4).map(async item => {
      if (item.err !== null) return [];
      const transaction = await rpc('getTransaction', [item.signature, { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0 }]);
      if (!transaction || transaction.transaction?.signatures?.[0] !== item.signature) throw new Error('Transaction history gap; checkpoint retained');
      const block = await getBlock(transaction.slot), transactionIndex = block?.signatures?.indexOf(item.signature) ?? -1;
      return decodeKydosTransaction(transaction, { chain, transactionIndex });
    }));
    rows.push(...group.flat());
  }
  return { rows, scanned: signatures.length, head: signatures[0]?.signature || null, before: signatures.at(-1)?.signature || null, complete: signatures.length < limit };
}
export const canonicalFilter = chain => ({ chain, program: PROGRAM_ADDRESS, decoder_version: DECODER_VERSION, status: 'confirmed', commitment: 'finalized', source: 'kydos-events' });
export function advanceIndexState(state, page, mode, now = Date.now()) {
  const next = { ...state };
  if (mode === 'history') { next.history_before = page.before || state.history_before; next.history_complete = page.complete; }
  else if (!state.head) {
    next.head = page.head || ''; next.history_before = page.before || ''; next.history_complete = page.complete; next.last_synced_at = now;
  } else {
    next.pending_head = state.pending_head || page.head || state.head;
    if (page.complete) { next.head = next.pending_head; next.pending_head = ''; next.live_before = ''; next.last_synced_at = now; }
    else { next.live_before = page.before; }
  }
  return next;
}
export async function readEventWindow(entity, filter, { before, after, limit = 200 } = {}) {
  if (before && after) throw new Error('Choose an older or a newer window');
  const direction = after ? '' : '-', query = { ...filter };
  if (before || after) query.order_key = { [after ? '$gt' : '$lt']: after || before };
  const rows = await entity.filter(query, direction + 'order_key', limit);
  const events = uniqueEvents(rows).sort((a, b) => a.order_key.localeCompare(b.order_key));
  return { events, nextBefore: rows.length === limit ? events[0]?.order_key || null : null,
    nextAfter: events.at(-1)?.order_key || after || null, hasMore: rows.length === limit };
}
