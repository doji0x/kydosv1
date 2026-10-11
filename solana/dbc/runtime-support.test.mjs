import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertLocal, confirmed, executor, verifyFixture } from './runtime-support.mjs';
const local = (error = null) => ({ rpcEndpoint: 'http://127.0.0.1:18899',
  getSignatureStatuses: async () => ({ value: [{ confirmationStatus: 'confirmed', err: error }] }),
  getTransaction: async () => ({ meta: { err: error } }),
  getBlockHeight: async () => 1 });
test('runtime rejects any non-isolated endpoint before network access', async () => {
  for (const rpcEndpoint of ['https://api.mainnet-beta.solana.com', 'http://localhost:8899', 'http://127.0.0.1:8899']) {
    const connection = { rpcEndpoint };
    assert.throws(() => assertLocal(connection)); assert.throws(() => executor(connection));
    await assert.rejects(confirmed(connection, 'not-sent'));
  }
});
test('confirmation uses executed metadata rather than submission success', async () => {
  assert.equal((await confirmed(local(), 'test')).meta.err, null);
});
test('negative execution remains an explicit InstructionError', async () => {
  const err = { InstructionError: [0, { Custom: 1 }] };
  assert.deepEqual((await confirmed(local(err), 'test')).meta.err, err);
});
test('conflicting confirmation evidence fails closed', async () => {
  const c = local(); c.getTransaction = async () => ({ meta: { err: 'different' } });
  await assert.rejects(confirmed(c, 'test'), /disagree/);
});
test('expired unconfirmed transaction cannot be counted as a passing rejection', async () => {
  const c = local(); c.getSignatureStatuses = async () => ({ value: [null] });
  await assert.rejects(confirmed(c, 'test', 0), /expired/);
});
test('fixture validation checks ELF and exact Git blob identity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dbc-fixture-check-')), path = join(dir, 'test.so');
  try {
    const bytes = Buffer.from([127, 69, 76, 70, 1]); writeFileSync(path, bytes);
    const expected = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(verifyFixture(path, expected).gitBlob, expected);
    assert.throws(() => verifyFixture(path, '0'.repeat(40)), /Unexpected/);
    writeFileSync(path, Buffer.alloc(5)); assert.throws(() => verifyFixture(path, expected), /ELF/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
