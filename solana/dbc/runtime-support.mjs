/** Isolated test infrastructure. Never reads a wallet file or accepts a public RPC. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputeBudgetProgram, Transaction } from '@solana/web3.js';

export const FIXTURES = Object.freeze({
  'dynamic_bonding_curve.so': '7fd83fbd3553fce004fb7af73ec230aa6d0a3360',
  'cp_amm.so': '946562cfc35b978dbaf1100363b7505b018fd6f6',
  'metaplex.so': '5da6f4fa684bd01fc15a7d20eca754a11d247348',
});
export function verifyFixture(path, expected) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 4).toString('hex'), '7f454c46', 'Not an ELF');
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(actual, expected, 'Unexpected program fixture');
  return { gitBlob: actual, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
export function assertLocal(connection) {
  assert.equal(connection.rpcEndpoint, 'http://127.0.0.1:18899', 'Runtime may use only its private loopback validator');
}
export async function confirmed(connection, signature, lastValidBlockHeight, timeoutMs = 20000) {
  assertLocal(connection);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value: [status] } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      const transaction = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (transaction?.meta) {
        assert.deepEqual(transaction.meta.err, status.err, 'Confirmation and executed metadata disagree');
        return transaction;
      }
    } else if (lastValidBlockHeight !== undefined && await connection.getBlockHeight() > lastValidBlockHeight) {
      throw new Error(`Test transaction expired: ${signature}`);
    }
    await delay(100);
  }
  throw new Error(`No executed confirmation before deadline: ${signature}`);
}
export function executor(connection) {
  assertLocal(connection);
  let sequence = 0;
  const measurements = [];
  return {
    measurements,
    async send(transaction, signers, { program, succeeds = true } = {}) {
      assertLocal(connection);
      const latest = await connection.getLatestBlockhash();
      const tx = new Transaction({ ...latest, feePayer: signers[0].publicKey }).add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 + (++sequence) }),
        ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
        ...transaction.instructions.filter(ix => !ix.programId.equals(ComputeBudgetProgram.programId)),
      );
      tx.sign(...signers);
      const bytes = tx.serialize();
      assert.ok(bytes.length <= 1232, 'Transaction does not fit packet limit');
      const signature = await connection.sendRawTransaction(bytes, { skipPreflight: true, maxRetries: 2 });
      const result = await confirmed(connection, signature, latest.lastValidBlockHeight);
      if (program) assert.ok(result.meta.logMessages?.some(l => l.includes(`Program ${program} invoke`)), 'Expected program did not execute');
      if (succeeds) assert.equal(result.meta.err, null, JSON.stringify(result.meta.logMessages));
      else assert.ok(result.meta.err, 'Negative test unexpectedly succeeded');
      measurements.push({ signature, bytes: bytes.length, computeUnits: result.meta.computeUnitsConsumed,
        networkFeeLamports: result.meta.fee, succeeded: result.meta.err === null });
      return result;
    },
  };
}
export async function snapshot(connection, keys) {
  const accounts = await connection.getMultipleAccountsInfo(keys);
  return accounts.map(a => a === null ? null : ({ owner: a.owner.toBase58(), lamports: a.lamports,
    executable: a.executable, data: a.data.toString('base64') }));
}
