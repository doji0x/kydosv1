// Test-only confirmation. Expected instruction failures are DATA, not transport
// exceptions. Never accept a rejected promise as proof that a program rejected.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
export async function confirmed(connection, signature, {
  requiredProgram, lastValidBlockHeight, attempts = 150, sleep = delay,
} = {}) {
  assert.ok(typeof signature === 'string' && signature.length > 0);
  assert.ok(Number.isSafeInteger(attempts) && attempts > 0 && attempts <= 300);
  let observed;
  for (let i = 0; i < attempts; i++) {
    const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = response.value?.[0];
    if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) {
      observed = status;
      const recorded = await connection.getTransaction(signature, {
        commitment: 'confirmed', maxSupportedTransactionVersion: 0,
      });
      if (recorded?.meta) {
        assert.equal(recorded.slot, status.slot, 'Confirmation/transaction slot mismatch');
        assert.deepEqual(recorded.meta.err, status.err, 'Confirmation/transaction error mismatch');
        if (requiredProgram) assert.ok(recorded.meta.logMessages?.includes(
          `Program ${requiredProgram} invoke [1]`), 'Required program did not execute');
        return recorded;
      }
    }
    // A recorded confirmed failure is not an expired transaction. Missing metadata
    // must still time out, never turn into a successful negative test.
    if (!observed && lastValidBlockHeight !== undefined &&
        await connection.getBlockHeight('confirmed') > lastValidBlockHeight) {
      throw new Error('Unconfirmed local transaction expired; execution not established');
    }
    await sleep(200);
  }
  throw new Error('Confirmed transaction metadata unavailable; execution not established');
}
