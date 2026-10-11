/** Exact baseline preservation check; requires a git checkout containing BASELINE_COMMIT. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { BASELINE_COMMIT } from './evidence.mjs';

const baseline = path => execFileSync('git', ['show', `${BASELINE_COMMIT}:${path}`], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
const current = path => readFileSync(path, 'utf8');
const libPath = 'solana/programs/kydos_launchpad/src/lib.rs';
let lib = current(libPath);
// Removing only these approved modules/imports and thin dispatchers must still
// reproduce the original creation/trading source byte-for-byte.
for (const addition of [
  'pub mod dbc_fees;\nuse dbc_fees::*;\n',
  '    pub fn launch_dbc(ctx: Context<LaunchDbc>, metadata: DbcMetadata) -> Result<()> {\n        dbc_fees::launch(ctx, metadata)\n    }\n\n',
  '    pub fn settle_damm_fees(ctx: Context<SettleDammFees>) -> Result<()> {\n        dbc_fees::settle(ctx)\n    }\n\n',
  '    pub fn claim_dbc_fees(ctx: Context<ClaimDbcFees>) -> Result<()> {\n        dbc_fees::claim_bonding(ctx)\n    }\n\n',
  'pub mod protected_migration;\nuse protected_migration::*;\n',
  '    pub fn install_migration_route(ctx: Context<InstallMigrationRoute>) -> Result<()> {\n        protected_migration::install(ctx)\n    }\n\n',
  '    pub fn migrate(ctx: Context<Migrate>, max_setup_lamports: u64) -> Result<()> {\n        protected_migration::migrate(ctx, max_setup_lamports)\n    }\n\n',
]) {
  assert.ok(lib.split(addition).length <= 2, 'Duplicate migration addition');
  lib = lib.replace(addition, '');
}
assert.equal(lib, baseline(libPath), 'Existing creation/trading source changed');
for (const path of [
  'solana/programs/kydos_launchpad/src/math.rs', 'solana/programs/kydos_launchpad/src/fees.rs',
  'solana/programs/kydos_launchpad/src/fees/settlement.rs', 'solana/programs/kydos_launchpad/src/migration.rs',
  'src/lib/solana/client.js', 'src/lib/solana/curveMath.js', 'src/lib/solana/settlement.js',
]) assert.equal(current(path), baseline(path), `Unapproved baseline change: ${path}`);
const idlPath = 'src/lib/solana/idl/kydos_launchpad.json';
const oldIdl = JSON.parse(baseline(idlPath)), newIdl = JSON.parse(current(idlPath));
assert.equal(newIdl.address, oldIdl.address, 'Program ID changed');
for (const group of ['instructions', 'accounts', 'types', 'events']) {
  const items = newIdl[group] ?? [];
  assert.equal(new Set(items.map(i => i.name)).size, items.length, `Duplicate ${group} names`);
  for (const old of oldIdl[group] ?? []) assert.deepEqual(items.find(i => i.name === old.name), old, `Existing ${group} interface changed: ${old.name}`);
}
assert.deepEqual((newIdl.errors ?? []).slice(0, (oldIdl.errors ?? []).length), oldIdl.errors ?? [], 'Existing errors changed');
console.log(`Compatibility preserved against ${BASELINE_COMMIT}: existing creation/trading source, accounts, instructions and errors unchanged.`);
