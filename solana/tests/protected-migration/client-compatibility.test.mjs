import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeLegacyClientTypes } from '../../scripts/protected-migration/type-annotations.mjs';

const source = readFileSync(new URL('../../../src/lib/solana/client.js', import.meta.url), 'utf8');
const originalBlob = '6cf0d7abac64a267918afc91a324b4006ecac924';
const gitBlob = text => {
  const bytes = Buffer.from(text);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};
const assertPreserved = text => assert.equal(gitBlob(normalizeLegacyClientTypes(text)), originalBlob);

test('only the two exact IDL annotations reproduce the original client blob', () => {
  assert.equal(source.split('/** @type {import("@coral-xyz/anchor").Idl} */ (idl)').length - 1, 2);
  assertPreserved(source);
});
test('unannotated baseline remains byte-identical and normalization is idempotent', () => {
  const baseline = normalizeLegacyClientTypes(source);
  assert.equal(normalizeLegacyClientTypes(baseline), baseline);
  assertPreserved(baseline);
});
test('runtime and recipient changes are still rejected', () => {
  for (const [before, after] of [
    ['maxRetries: 0', 'maxRetries: 3'],
    ['10000 - slippageBps', '10000 + slippageBps'],
    ['new PublicKey(TREASURY_ADDRESS)', 'new PublicKey(idl.address)'],
    ['skipPreflight: false', 'skipPreflight: true'],
  ]) {
    assert.ok(source.includes(before));
    assert.throws(() => assertPreserved(source.replace(before, after)));
  }
  assert.throws(() => assertPreserved(source + '\nconsole.log("changed");\n'));
});
test('different casts, comments and whitespace are not silently stripped', () => {
  assert.throws(() => assertPreserved(source.replace('import("@coral-xyz/anchor").Idl', 'any')));
  assert.throws(() => assertPreserved(source + '\n// unreviewed change\n'));
  assert.throws(() => assertPreserved(source.replace('const accountsCoder', ' const accountsCoder')));
});
test('duplicate reviewed lines fail rather than concealing duplicate code', () => {
  for (const line of source.split('\n').filter(line => line.includes('/** @type {import("@coral-xyz/anchor").Idl} */ (idl)'))) {
    assert.throws(() => normalizeLegacyClientTypes(source + '\n' + line), /Duplicate/);
  }
});
test('annotation-like string content and unrelated comments remain untouched', () => {
  const text = 'const text = "/** @type {import(\\"@coral-xyz/anchor\\").Idl} */ (idl)";\n// Keep this comment.\n';
  assert.equal(normalizeLegacyClientTypes(text), text);
});
