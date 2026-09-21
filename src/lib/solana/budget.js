// One job, one aggregate gross allowance. This module is NOT live-test approval.
// The shipping application has no mainnet signer or approved instruction cost model.
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const MAINNET_LIMIT = 50_000_000n;
export const BUDGET_KEY = 'kydos.mainnet.single-test.lifecycle-job.v1';
const COMPONENTS = ['principal', 'rent', 'baseFees', 'priorityFees', 'protocolCharges'];
const integer = value => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Costs must be nonnegative integer lamport strings');
  return BigInt(value);
};
export function grossBound(costs) {
  if (!costs || Object.keys(costs).length !== COMPONENTS.length) throw new Error('Complete gross cost bound required; refunds cannot offset it');
  return COMPONENTS.reduce((sum, key) => sum + integer(costs[key]), 0n);
}
export function validateLedger(ledger) {
  if (ledger?.version !== 1 || ledger.job !== 'single-test-lifecycle' || typeof ledger.testId !== 'string' || !ledger.testId || !Array.isArray(ledger.reservations)) throw new Error('Invalid budget ledger');
  const ids = new Set();
  let total = 0n;
  for (const r of ledger.reservations) {
    if (!r.id || ids.has(r.id) || !r.messageDigest) throw new Error('Invalid/duplicate reservation');
    ids.add(r.id);
    total += grossBound(r.costs);
  }
  if (total > MAINNET_LIMIT) throw new Error('Aggregate mainnet budget exceeded');
  return MAINNET_LIMIT - total;
}
// For an isolated harness only. Explicit provisioning is deliberate: absence is
// not interpreted as an unused allowance, and there is no reset/release API.
export function createBudgetLedger({ storage, locks }) {
  const read = () => {
    const raw = storage.getItem(BUDGET_KEY);
    if (!raw) throw new Error('Budget ledger not provisioned; live test disabled');
    const ledger = JSON.parse(raw); validateLedger(ledger); return ledger;
  };
  return {
    read,
    async reserve({ testId, id, messageDigest, costs }) {
      if (!locks?.request) throw new Error('Exclusive budget storage unavailable');
      return locks.request(BUDGET_KEY, { mode: 'exclusive' }, async () => {
        const ledger = read();
        if (ledger.testId !== testId) throw new Error('A second funded test is not authorized');
        if (ledger.closed || ledger.reservations.some(r => !r.actual)) throw new Error('Prior outcome unresolved or test closed; no additional signature');
        grossBound(costs);
        const next = { ...ledger, reservations: [...ledger.reservations, { id, messageDigest, costs }] };
        const remaining = validateLedger(next);
        const raw = JSON.stringify(next);
        storage.setItem(BUDGET_KEY, raw);
        if (storage.getItem(BUDGET_KEY) !== raw) throw new Error('Budget persistence failed');
        return remaining;
      });
    },
    async recordActual({ id, signature, grossLamports, feeLamports }) {
      if (!locks?.request) throw new Error('Exclusive budget storage unavailable');
      return locks.request(BUDGET_KEY, { mode: 'exclusive' }, async () => {
        const ledger = read(), r = ledger.reservations.find(item => item.id === id);
        if (!r || r.actual || !signature) throw new Error('Invalid settlement');
        const gross = integer(grossLamports), fees = integer(feeLamports);
        if (fees > gross) throw new Error('Gross debit must include fees');
        r.actual = { signature, grossLamports, feeLamports };
        // Reservations are never refunded, even for failed transactions.
        ledger.closed = gross > grossBound(r.costs) || ledger.closed === true;
        const raw = JSON.stringify(ledger);
        storage.setItem(BUDGET_KEY, raw);
        if (storage.getItem(BUDGET_KEY) !== raw) throw new Error('Budget settlement persistence failed');
      });
    },
  };
}

export function assertMainnetHarnessReady() {
  // Never accept caller booleans or simulations as proof of bounded CPI effects.
  // Replace only after independent review of an approved, exact instruction cost
  // model and durable external ledger. No live executable allowlist exists yet.
  throw new Error('Mainnet disabled: approved policy, deployed identity, independent review, signer and bounded instruction adapter are not verified');
}
