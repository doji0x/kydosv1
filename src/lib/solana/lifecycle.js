// Public recovery metadata only: never persist private keys or signed wire bytes.
// Web Locks serialize read/modify/write AND signing across same-origin tabs.
// Missing Web Locks/storage is a hard failure, not a best-effort fallback.
export const ACTIVITY_KEY = 'kydos.solana.activity.v1';
export const ACTIVITY_LOCK = 'kydos.solana.activity.v1';
const TERMINAL = new Set(['confirmed', 'failed', 'rejected', 'not-submitted']);
const STATES = new Set([...TERMINAL, 'preparing', 'signing', 'signed', 'submitting', 'unknown']);
export const unresolved = record => !TERMINAL.has(record.state);
export const scopeKey = scope => JSON.stringify([scope.wallet, scope.chain, scope.program, scope.operation]);
const conflictKey = scope => JSON.stringify([scope.wallet, scope.chain, scope.program, scope.conflict]);

export function createActivityStore({ storage, locks, notify = () => {}, now = Date.now, id = () => globalThis.crypto.randomUUID() }) {
  function read() {
    const raw = storage.getItem(ACTIVITY_KEY);
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.records)) throw new Error('Invalid activity journal; submission disabled');
    const ids = new Set();
    for (const r of data.records) {
      if (!r.id || ids.has(r.id) || !STATES.has(r.state) || !r.scope ||
          ['wallet', 'chain', 'program', 'operation', 'conflict'].some(k => typeof r.scope[k] !== 'string' || !r.scope[k]) ||
          (['signed', 'submitting', 'unknown', 'confirmed', 'failed'].includes(r.state) && !r.signature)) {
        throw new Error('Invalid activity record; submission disabled');
      }
      ids.add(r.id);
    }
    return data.records;
  }
  function write(records) {
    const value = JSON.stringify({ version: 1, records });
    storage.setItem(ACTIVITY_KEY, value);
    if (storage.getItem(ACTIVITY_KEY) !== value) throw new Error('Activity persistence verification failed');
    notify();
  }
  async function exclusive(fn) {
    if (!locks?.request) throw new Error('Web Locks unavailable; durable submission disabled');
    return locks.request(ACTIVITY_LOCK, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) throw new Error('Another tab is operating; wait and inspect activity');
      return fn();
    });
  }
  function update(record, patch) {
    const records = read();
    const index = records.findIndex(r => r.id === record.id);
    if (index < 0) throw new Error('Recovery record missing; submission disabled');
    const next = { ...records[index], ...patch, updatedAt: now() };
    records[index] = next;
    write(records);
    return next;
  }
  async function execute(scope, metadata, action) {
    return exclusive(async () => {
      scopeKey(scope); // Scope is also validated when the journal is read back.
      if (['wallet', 'chain', 'program', 'operation', 'conflict'].some(k => typeof scope[k] !== 'string' || !scope[k])) throw new Error('Missing transaction scope');
      const records = read();
      if (records.some(r => unresolved(r) && conflictKey(r.scope) === conflictKey(scope))) {
        throw new Error('Unresolved conflicting operation. Reconcile activity; do not replace it.');
      }
      let record = { id: id(), scope, metadata, state: 'preparing', createdAt: now(), updatedAt: now() };
      write([...records, record]);
      const save = patch => { record = update(record, patch); return record; };
      try { return await action(save, record); }
      catch (cause) {
        // No network submission occurs before the durable submitting marker.
        // A storage failure leaves the earlier, more conservative marker intact.
        const state = ['submitting', 'unknown'].includes(record.state) ? 'unknown'
          : record.state === 'failed' ? 'failed'
          : record.state === 'confirmed' ? 'confirmed'
          : cause?.code === 4001 && record.state === 'signing' ? 'rejected' : 'not-submitted';
        try { save({ state, message: state === 'unknown' ? 'Submission ambiguous; reconcile history, never replace automatically.' : state }); } catch { /* Keep durable lock. */ }
        const error = new Error(state === 'unknown' ? 'Submission ambiguous. Inspect persistent activity; do not resubmit.' : cause?.message || state);
        error.state = state; error.signature = record.signature; error.mint = metadata.mint; error.recordId = record.id;
        throw error;
      }
    });
  }
  async function reconcile(recordId, connection) {
    return exclusive(async () => {
      const record = read().find(r => r.id === recordId);
      if (!record) throw new Error('Activity not found');
      if (!unresolved(record)) return record;
      if (await connection.getGenesisHash() !== record.scope.chain) throw new Error('Recovery RPC chain mismatch');
      // Holding the same lock proves no cooperating sender is still running.
      // Only submitting (written BEFORE the RPC call) could have broadcast.
      if (['preparing', 'signing', 'signed'].includes(record.state)) {
        return update(record, { state: 'not-submitted', message: 'Recovered pre-broadcast journal. This client did not submit.' });
      }
      const evidence = { checkedAt: now(), historySearched: true };
      const { value } = await connection.getSignatureStatuses([record.signature], { searchTransactionHistory: true });
      const status = value[0];
      if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) {
        return update(record, { state: status.err ? 'failed' : 'confirmed', evidence: { ...evidence, slot: status.slot }, message: status.err ? 'Confirmed on-chain failure' : 'Confirmed on chain' });
      }
      // Query the archival transaction endpoint as well as the status cache.
      const transaction = await connection.getTransaction(record.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (transaction?.meta) {
        return update(record, { state: transaction.meta.err ? 'failed' : 'confirmed', evidence: { ...evidence, slot: transaction.slot }, message: transaction.meta.err ? 'Historical on-chain failure' : 'Historical confirmation' });
      }
      const height = await connection.getBlockHeight('confirmed');
      return update(record, { state: 'unknown', evidence: { ...evidence, height, expired: height > record.lastValidBlockHeight }, message: 'No confirmed history found. Expiry/absence is not proof of non-submission. Lock retained.' });
    });
  }
  return { read, execute, reconcile };
}

export function browserActivity() {
  return createActivityStore({ storage: globalThis.localStorage, locks: globalThis.navigator?.locks,
    notify: () => globalThis.dispatchEvent(new Event('solana-activity')) });
}
