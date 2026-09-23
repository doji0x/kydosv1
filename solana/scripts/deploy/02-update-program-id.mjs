import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const solana = fileURLToPath(new URL('../../', import.meta.url));
const root = resolve(solana, '..');
const keypair = resolve(solana, 'target/deploy/kydos_launchpad-keypair.json');
const stamp = resolve(solana, '.program-id');
const targets = [
  ['solana/programs/kydos_launchpad/src/lib.rs', /declare_id!\("([1-9A-HJ-NP-Za-km-z]{32,44})"\)/g, id => `declare_id!("${id}")`],
  ['solana/Anchor.toml', /^(kydos_launchpad = ")[1-9A-HJ-NP-Za-km-z]{32,44}(".*)$/gm, id => `kydos_launchpad = "${id}"`],
  ['base44/shared/solanaProtocol.js', /^(export const PROGRAM_ADDRESS = ')[1-9A-HJ-NP-Za-km-z]{32,44}(';.*)$/gm, id => `export const PROGRAM_ADDRESS = '${id}';`],
];
try {
  console.log('== Update Kydos program identity ==');
  const id = process.argv[2];
  if (!id || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) throw new Error('Usage: node solana/scripts/deploy/02-update-program-id.mjs <program-id>');
  const key = spawnSync('solana-keygen', ['pubkey', keypair], { encoding: 'utf8' });
  if (key.error || key.status !== 0) throw new Error('Cannot read the program keypair. Run step 01 first.');
  if (key.stdout.trim() !== id || readFileSync(stamp, 'utf8').trim() !== id) throw new Error('Provided ID, keypair and .program-id stamp must match.');
  const edits = targets.map(([name, pattern, render]) => {
    const path = resolve(root, name), before = readFileSync(path, 'utf8');
    const matches = [...before.matchAll(pattern)];
    if (matches.length !== 1) throw new Error(`Expected exactly one program identity in ${name}; found ${matches.length}. No files changed.`);
    const after = before.replace(pattern, render(id));
    return { name, path, after };
  });
  for (const { name, path, after } of edits) { writeFileSync(path, after); console.log(`Updated ${name}`); }
  console.log(`\nProgram ID: ${id}\nThe admin launcher imports PROGRAM_ADDRESS from base44/shared/solanaProtocol.js (there is no hardcoded ID in its function).`);
  console.log('NEXT: Regenerate and sync the browser IDL (see solana/docs/deployment.md), check tests, commit the changed source/IDL, and publish the updated app and admin launch function.');
} catch (error) { console.error(error.message); process.exitCode = 1; }