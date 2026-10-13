/** Only the two reviewed, compiler-only Anchor IDL casts may differ.
 * No generic comment removal, whitespace normalization or new baseline is used.
 */
import assert from 'node:assert/strict';

const permittedLines = [
  [
    'const accountsCoder = new BorshAccountsCoder(/** @type {import("@coral-xyz/anchor").Idl} */ (idl));',
    'const accountsCoder = new BorshAccountsCoder(idl);',
  ],
  [
    `const programFor = (connection, wallet) => new Program(/** @type {import("@coral-xyz/anchor").Idl} */ (idl), new AnchorProvider(connection, wallet, { commitment: 'confirmed' }));`,
    `const programFor = (connection, wallet) => new Program(idl, new AnchorProvider(connection, wallet, { commitment: 'confirmed' }));`,
  ],
];

export function normalizeLegacyClientTypes(source) {
  assert.equal(typeof source, 'string', 'Legacy client source must be text');
  const lines = source.split('\n');
  for (const [annotated, original] of permittedLines) {
    const matches = lines.flatMap((line, index) => line === annotated ? [index] : []);
    assert.ok(matches.length <= 1, 'Duplicate approved IDL annotation');
    if (matches.length === 1) lines[matches[0]] = original;
  }
  return lines.join('\n');
}
