import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeKey, decodeKey, digest, KYDOS_PROGRAM, DAMM_PROGRAM, LOADER_V3,
  CONFIG_DISCRIMINATOR, programDataPointer, inspectProgramData, verifyDynamicConfig,
  verifyGenesis, verifyAllocatedBytecode } from '../../scripts/protected-migration/evidence.mjs';

const key = byte => encodeKey(Buffer.alloc(32, byte));
function programFixture() {
  const data = Buffer.alloc(36); data.writeUInt32LE(2); decodeKey(key(2)).copy(data, 4);
  const pd = Buffer.alloc(61); pd.writeUInt32LE(3); pd.writeBigUInt64LE(42n, 4); pd[12] = 1;
  decodeKey(key(3)).copy(pd, 13); Buffer.from([127, 69, 76, 70, 3, 9]).copy(pd, 45);
  return { program: KYDOS_PROGRAM, account: { data, owner: LOADER_V3, executable: true },
    programDataAddress: key(2), derivedProgramData: key(2),
    programData: { data: pd, owner: LOADER_V3, executable: false } };
}
function configFixture() {
  const data = Buffer.alloc(328); CONFIG_DISCRIMINATOR.copy(data); decodeKey(key(4)).copy(data, 40);
  data[202] = 1; data.writeBigUInt64LE((1n << 64n) - 1n, 208);
  return { address: key(5), authority: key(4), derivedAddress: key(5),
    account: { data, owner: DAMM_PROGRAM, executable: false } };
}

test('canonical base58 round trips incl. leading zeros and real IDs', () => {
  for (const k of [KYDOS_PROGRAM, DAMM_PROGRAM, LOADER_V3, key(0), key(255)]) assert.equal(encodeKey(decodeKey(k)), k);
  for (let i = 0; i < 32; i++) { const bytes = Buffer.alloc(32); bytes[i] = 7; assert.deepEqual(decodeKey(encodeKey(bytes)), bytes); }
});
test('base58 rejects malformed, padded and out-of-range values', () => {
  for (const k of [null, '', '0'.repeat(32), '1'.repeat(33), 'z'.repeat(44), key(3) + ' ', ' ' + key(3)]) assert.throws(() => decodeKey(k));
  assert.throws(() => encodeKey(Buffer.alloc(31)));
});
test('loader observation reports evidence but never implies authority control', () => {
  const r = inspectProgramData(programFixture());
  assert.equal(r.deploymentSlot, '42'); assert.equal(r.upgradeAuthority, key(3));
  assert.equal(r.upgradeable, true); assert.equal(r.sourceBinaryVerified, false); assert.equal(r.authorityControlVerified, false);
  assert.equal(r.allocationBytes, 16); assert.match(r.allocatedBytecodeSha256, /^[a-f0-9]{64}$/);
});
test('immutable program is explicit, not reported as upgradeable', () => {
  const f = programFixture(); f.programData.data[12] = 0;
  const r = inspectProgramData(f); assert.equal(r.upgradeable, false); assert.equal(r.upgradeAuthority, null);
});
for (const [name, mutate] of [
  ['missing program', f => { f.account = null; }],
  ['wrong loader', f => { f.account.owner = DAMM_PROGRAM; }],
  ['nonexecutable program', f => { f.account.executable = false; }],
  ['bad program tag', f => f.account.data.writeUInt32LE(3)],
  ['bad program size', f => { f.account.data = Buffer.alloc(35); }],
  ['substituted ProgramData', f => { f.programDataAddress = key(7); }],
  ['noncanonical ProgramData PDA', f => { f.derivedProgramData = key(7); }],
  ['missing ProgramData', f => { f.programData = null; }],
  ['ProgramData wrong owner', f => { f.programData.owner = DAMM_PROGRAM; }],
  ['ProgramData executable', f => { f.programData.executable = true; }],
  ['bad ProgramData tag', f => f.programData.data.writeUInt32LE(2)],
  ['bad authority option', f => { f.programData.data[12] = 2; }],
  ['short ProgramData', f => { f.programData.data = Buffer.alloc(45); }],
  ['non-ELF ProgramData', f => { f.programData.data[45] = 0; }],
]) test(`rejects ${name}`, () => { const f = programFixture(); mutate(f); assert.throws(() => inspectProgramData(f)); });
test('valid config preserves full u64 index and fingerprints actual bytes', () => {
  const f = configFixture(), r = verifyDynamicConfig(f);
  assert.equal(r.index, '18446744073709551615'); assert.equal(r.configSha256, digest(f.account.data));
  assert.equal(r.permission, '0'); assert.equal(r.authority, key(4));
});
for (const [name, mutate] of [
  ['missing config', f => { f.account = null; }],
  ['default authority', f => { f.authority = key(0); }],
  ['wrong authority', f => { f.authority = key(6); }],
  ['wrong config owner', f => { f.account.owner = LOADER_V3; }],
  ['executable config', f => { f.account.executable = true; }],
  ['wrong size', f => { f.account.data = Buffer.alloc(327); }],
  ['wrong discriminator', f => { f.account.data[0] ^= 1; }],
  ['AlphaVault', f => { f.account.data[8] = 1; }],
  ['static config', f => { f.account.data[202] = 0; }],
  ['permissions', f => { f.account.data[263] = 1; }],
  ['wrong derived config', f => { f.derivedAddress = key(8); }],
]) test(`config rejects ${name}`, () => { const f = configFixture(); mutate(f); assert.throws(() => verifyDynamicConfig(f)); });
test('config fingerprint detects bytes outside the policy fields', () => {
  const f = configFixture(), original = verifyDynamicConfig(f).configSha256;
  f.account.data[300] = 1; assert.notEqual(verifyDynamicConfig(f).configSha256, original);
});
test('genesis comparison fails closed for mismatched or missing cluster identity', () => {
  assert.equal(verifyGenesis(key(2), key(2)), key(2));
  for (const expected of [key(3), null, '', key(2).slice(0, 32)]) assert.throws(() => verifyGenesis(key(2), expected));
});
test('bytecode comparison permits only documented allocation padding', () => {
  const candidate = Buffer.from([127,69,76,70,1,2,3]), allocated = Buffer.concat([candidate, Buffer.alloc(5)]);
  assert.equal(verifyAllocatedBytecode(allocated, candidate).trailingZeroBytes, 5);
  allocated[11] = 1; assert.throws(() => verifyAllocatedBytecode(allocated, candidate));
  assert.throws(() => verifyAllocatedBytecode(candidate.subarray(0, 5), candidate));
  assert.throws(() => verifyAllocatedBytecode(Buffer.alloc(9), Buffer.alloc(4)));
});
test('pointer parser does not accept raw public-key assumptions', () => {
  assert.equal(programDataPointer(programFixture().account), key(2));
  assert.throws(() => programDataPointer({ owner: LOADER_V3, executable: true, data: 'not bytes' }));
});

test('CLI requires explicit cluster and rejects duplicate/unsafe options', async () => {
  const { options } = await import('../../scripts/protected-migration/inspect.mjs');
  assert.equal(options(['--cluster', 'devnet']).cluster, 'devnet');
  for (const args of [[], ['--cluster','testnet'], ['--cluster','devnet','--cluster','devnet'],
    ['--cluster','devnet','--send','yes'], ['--cluster','devnet','--rpc','http://api.devnet.solana.com'],
    ['--cluster','devnet','--rpc','https://user:password@example.com'], ['--cluster','devnet','--config','bad']]) assert.throws(() => options(args));
});
test('RPC allowlist prevents every write before transport is reached', async () => {
  const { readonlyRpc } = await import('../../scripts/protected-migration/inspect.mjs');
  let calls = 0;
  const rpc = readonlyRpc('https://example.com', async () => { calls++; throw new Error('not called'); });
  for (const method of ['sendTransaction','requestAirdrop','simulateTransaction','setAuthority','', 'getBalance']) await assert.rejects(rpc(method), /allowlist/);
  assert.equal(calls, 0);
});
test('RPC transport never echoes an endpoint credential', async () => {
  const { readonlyRpc } = await import('../../scripts/protected-migration/inspect.mjs');
  const rpc = readonlyRpc('https://example.com/?api-key=SECRET', async () => { throw new Error('SECRET'); });
  await assert.rejects(rpc('getGenesisHash'), error => !error.message.includes('SECRET') && /unavailable/.test(error.message));
});
test('RPC rejects malformed envelopes and non-200 responses', async () => {
  const { readonlyRpc } = await import('../../scripts/protected-migration/inspect.mjs');
  for (const body of [{ jsonrpc:'2.0', id:2, result:key(1) }, { jsonrpc:'2.0', id:1, error:{message:'secret'} }, {}]) {
    await assert.rejects(readonlyRpc('https://example.com', async () => new Response(JSON.stringify(body)))('getGenesisHash'));
  }
  await assert.rejects(readonlyRpc('https://example.com', async () => new Response('', {status:403}))('getGenesisHash'), /403/);
});
test('network failure cannot produce a passing deployment observation', async () => {
  const { inspect } = await import('../../scripts/protected-migration/inspect.mjs');
  const r = await inspect({ cluster:'devnet' }, async () => { throw new Error('RPC transport unavailable'); }, null);
  assert.equal(r.releaseReady, false); assert.equal(r.status, 'not-release-ready');
  assert.equal(r.authorityControlVerified, false); assert.equal(r.sourceBinaryVerified, false);
  assert.ok(r.blockers.includes('RPC transport unavailable'));
});
