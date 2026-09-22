// Anchor generates Rust names; its Program constructor supplies the canonical
// camelCase interface consumed by the browser's standalone account coder.
import { readFile, writeFile } from 'node:fs/promises';
import { Program } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';

const generated = JSON.parse(await readFile(new URL('../target/idl/kydos_launchpad.json', import.meta.url), 'utf8'));
// Constructing the client does not make any RPC requests.
const program = new Program(generated, { connection: new Connection('http://127.0.0.1:8899') });
const expected = JSON.stringify(program.idl, null, 2) + '\n';
const destination = new URL('../../src/lib/solana/idl/kydos_launchpad.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== expected) throw new Error('Browser IDL differs from the built program. Run node scripts/sync-idl.mjs from solana/.');
  console.log('Browser IDL matches the generated program interface.');
} else {
  await writeFile(destination, expected);
  console.log('Browser IDL synchronized from the generated program interface.');
}
