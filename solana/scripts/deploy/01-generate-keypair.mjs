import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const solana = fileURLToPath(new URL('../../', import.meta.url));
const keypair = resolve(solana, 'target/deploy/kydos_launchpad-keypair.json');
const stamp = resolve(solana, '.program-id');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: solana, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr?.trim() || 'unknown error'}`);
  return result.stdout.trim();
}
try {
  console.log('== Generate Kydos mainnet program identity ==');
  if (existsSync(keypair) || existsSync(stamp)) throw new Error('A program keypair or ID stamp already exists. Do not overwrite it; back it up and inspect it first.');
  mkdirSync(resolve(solana, 'target/deploy'), { recursive: true });
  run('solana-keygen', ['new', '--outfile', keypair, '--no-bip39-passphrase', '--silent']);
  const id = run('solana-keygen', ['pubkey', keypair]);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) throw new Error('Generated public key was invalid; inspect the keypair before continuing.');
  writeFileSync(stamp, `${id}\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Program ID: ${id}\nKeypair: ${keypair}\nBack up the keypair securely before continuing. It is not your funded deployment wallet.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }