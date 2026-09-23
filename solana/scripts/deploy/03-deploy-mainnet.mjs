import { existsSync, statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const solana = fileURLToPath(new URL('../../', import.meta.url));
const root = resolve(solana, '..');
const keypair = resolve(solana, 'target/deploy/kydos_launchpad-keypair.json');
const binary = resolve(solana, 'target/deploy/kydos_launchpad.so');
const mainnetGenesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: solana, encoding: 'utf8', stdio: options.stream ? 'inherit' : 'pipe' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed${result.error ? ': ' + result.error.message : ''}${options.stream ? '' : ': ' + (result.stderr || '').trim()}`);
  return result.stdout?.trim();
}
try {
  console.log('== Mainnet preflight ==');
  if (!existsSync(keypair)) throw new Error('Program keypair missing. Run step 01 first; never regenerate an existing deployed program keypair.');
  const id = run('solana-keygen', ['pubkey', keypair]);
  if (readFileSync(resolve(solana, '.program-id'), 'utf8').trim() !== id) throw new Error('Program ID stamp does not match the keypair.');
  const rust = readFileSync(resolve(solana, 'programs/kydos_launchpad/src/lib.rs'), 'utf8');
  const anchor = readFileSync(resolve(solana, 'Anchor.toml'), 'utf8');
  const shared = readFileSync(resolve(root, 'base44/shared/solanaProtocol.js'), 'utf8');
  const idl = JSON.parse(readFileSync(resolve(root, 'src/lib/solana/idl/kydos_launchpad.json'), 'utf8'));
  if (!rust.includes(`declare_id!("${id}")`) || !anchor.includes(`kydos_launchpad = "${id}"`) || !shared.includes(`PROGRAM_ADDRESS = '${id}'`) || idl.address !== id) throw new Error('Program ID differs across keypair, Rust, Anchor, server config or browser IDL. Complete step 02 and IDL sync first.');
  const endpoint = process.env.HELIUS_RPC_URL?.trim();
  if (!endpoint || !/^https:\/\//i.test(endpoint)) throw new Error('HELIUS_RPC_URL must be an HTTPS mainnet RPC URL in your local environment.');
  const genesis = run('solana', ['genesis-hash', '--url', endpoint]);
  if (genesis !== mainnetGenesis) throw new Error('RPC endpoint is not Solana mainnet. Deployment cancelled.');
  console.log(`Program ID: ${id}\nNetwork: Solana mainnet`);
  console.log('== Build locked SBF binary ==');
  run('anchor', ['build', '--program-name', 'kydos_launchpad', '--no-idl', '--', '--', '--locked'], { stream: true });
  if (!existsSync(binary) || statSync(binary).size === 0) throw new Error('Build did not produce a nonempty program binary.');
  console.log('== Deploy program to mainnet ==');
  run('solana', ['program', 'deploy', binary, '--program-id', keypair, '--url', endpoint], { stream: true });
  console.log(`Deployed program ID: ${id}\nVerify the executable account and confirm the app is published with the matching IDL before launching tokens.`);
} catch (error) { console.error(String(error.message).replaceAll(process.env.HELIUS_RPC_URL?.trim() || '\0', '[RPC endpoint]')); process.exitCode = 1; }