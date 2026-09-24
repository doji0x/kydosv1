import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { PROGRAM_ADDRESS } from '../../base44/shared/solanaProtocol.js';
import { DAMM_PROGRAM_ID } from '../../src/lib/solana/meteora.js';
import { prepareConfigRequest, creatorAuthority, configIndex, verifyConfig, discoverConfigs,
  checkApprovedRoute, networkFor } from '../scripts/lib/meteora-config.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/meteora-v2.json', import.meta.url)));
const row = fixture.addressCases[0];
const loader = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
function mock() {
  const data = Buffer.from(row.configDataHex, 'hex');
  creatorAuthority.toBuffer().copy(data, 40);
  const accounts = [{ executable: true, owner: loader }, { executable: true, owner: loader },
    { executable: false, owner: DAMM_PROGRAM_ID, data }];
  return { accounts, connection: {
    getGenesisHash: async () => networkFor('mainnet-beta').genesisHash,
    getMultipleAccountsInfoAndContext: async (keys, options) => {
      assert.deepEqual(keys.map(k => k.toBase58()), [PROGRAM_ADDRESS, DAMM_PROGRAM_ID.toBase58(), row.addresses.config]);
      assert.equal(options.commitment, 'finalized');
      return { context: { slot: 123 }, value: accounts };
    },
  } };
}

test('operator request uses the release PDA; index remains unchosen unless explicit', () => {
  const request = prepareConfigRequest('mainnet-beta');
  assert.equal(request.poolCreatorAuthority, '3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd');
  assert.equal(PublicKey.isOnCurve(creatorAuthority.toBytes()), false);
  assert.equal(request.config, null);
  assert.equal(request.index, null);
  assert.equal(request.configParameters.permission, '0');
  assert.equal(request.migrationEnabled, false);
  assert.equal(prepareConfigRequest('devnet', row.configIndex).config, row.addresses.config);
  for (const bad of ['-1', '1.2', '01', '18446744073709551616', '', 1, null]) assert.throws(() => configIndex(bad));
  assert.throws(() => prepareConfigRequest('testnet'));
  assert.deepEqual(request, JSON.parse(readFileSync(new URL('../config/meteora-mainnet-request.json', import.meta.url))));
});

test('verification records finalized evidence without approving or enabling migration', async () => {
  const { connection } = mock();
  const report = await verifyConfig(connection, 'mainnet-beta', row.addresses.config);
  assert.equal(report.verifiedSlot, 123);
  assert.equal(report.candidateValid, true);
  assert.equal(report.approved, false);
  assert.equal(report.migrationEnabled, false);
  assert.equal(report.proposedBinding.poolCreatorAuthority, creatorAuthority.toBase58());
  assert.equal(report.proposedBinding.index, row.configIndex);
  assert.match(report.proposedBinding.accountDataSha256, /^[a-f0-9]{64}$/);
});

test('verification rejects wrong cluster before reading accounts and unavailable programs', async () => {
  const { connection, accounts } = mock();
  await assert.rejects(verifyConfig(connection, 'devnet', row.addresses.config), /cluster mismatch/);
  for (const index of [0, 1]) {
    const original = accounts[index];
    for (const bad of [null, { ...original, executable: false }, { ...original, owner: SystemProgram.programId }]) {
      accounts[index] = bad;
      await assert.rejects(verifyConfig(connection, 'mainnet-beta', row.addresses.config), /executable/);
    }
    accounts[index] = original;
  }
});

test('verification rejects config substitutions, permissions and wrong creator custody', async () => {
  for (const offset of [0, 8, 40, 202, 208, 248]) {
    const { connection, accounts } = mock();
    accounts[2].data[offset] ^= 1;
    await assert.rejects(verifyConfig(connection, 'mainnet-beta', row.addresses.config));
  }
  const { connection, accounts } = mock();
  accounts[2] = null;
  await assert.rejects(verifyConfig(connection, 'mainnet-beta', row.addresses.config));
});

test('route gate fails closed without approval and detects approval tampering and live drift', async () => {
  const { connection, accounts } = mock();
  const empty = JSON.parse(readFileSync(new URL('../config/meteora-routes.json', import.meta.url)));
  await assert.rejects(checkApprovedRoute({}, 'mainnet-beta', empty), /No approved private config/);
  await assert.rejects(checkApprovedRoute({}, 'devnet', empty), /No approved private config/);
  const report = await verifyConfig(connection, 'mainnet-beta', row.addresses.config);
  const registry = { schemaVersion: 1, routes: { 'mainnet-beta': report.proposedBinding } };
  const approved = await checkApprovedRoute(connection, 'mainnet-beta', registry);
  assert.equal(approved.approved, true);
  assert.equal(approved.migrationEnabled, false);
  for (const field of ['cluster', 'genesisHash', 'launchpadProgram', 'dammProgram', 'poolCreatorAuthority', 'index', 'config', 'accountDataSha256']) {
    const changed = structuredClone(registry);
    changed.routes['mainnet-beta'][field] = field === 'index' ? '2' : 'invalid';
    await assert.rejects(checkApprovedRoute(connection, 'mainnet-beta', changed), undefined, field);
  }
  accounts[2].data[300] ^= 1; // Padding drift: structurally valid, different approved bytes.
  await assert.rejects(checkApprovedRoute(connection, 'mainnet-beta', registry), /data changed/);
});

test('discovery filters by exact creator and never adopts a candidate automatically', async () => {
  const { connection, accounts } = mock();
  connection.getProgramAccounts = async (program, options) => {
    assert.ok(program.equals(DAMM_PROGRAM_ID));
    assert.equal(options.commitment, 'finalized');
    assert.deepEqual(options.filters[2], { memcmp: { offset: 40, bytes: creatorAuthority.toBase58() } });
    return { context: { slot: 124 }, value: [{ pubkey: new PublicKey(row.addresses.config), account: accounts[2] }] };
  };
  const result = await discoverConfigs(connection, 'mainnet-beta');
  assert.deepEqual(result.candidates, [{ config: row.addresses.config, index: row.configIndex }]);
  assert.equal(result.approved, false);
  assert.equal(result.migrationEnabled, false);
  await assert.rejects(discoverConfigs(connection, 'devnet'), /cluster mismatch/);
});

test('CLI rejects unsafe options and redacts invalid RPC URL input', () => {
  const cli = new URL('../scripts/meteora-config.mjs', import.meta.url);
  const run = (args, env = {}) => spawnSync(process.execPath, [cli.pathname, ...args], {
    encoding: 'utf8', env: { ...process.env, KYDOS_RPC_URL: '', ...env },
  });
  assert.equal(run(['request', '--cluster', 'mainnet-beta']).status, 0);
  for (const args of [['send'], ['request', '--cluster', 'mainnet-beta', '--cluster', 'devnet'], ['request', '--cluster'],
    ['check', '--cluster', 'mainnet-beta', '--config', row.addresses.config]]) assert.equal(run(args).status, 1);
  const secret = 'invalid-secret-rpc-key';
  const bad = run(['discover', '--cluster', 'mainnet-beta'], { KYDOS_RPC_URL: secret });
  assert.equal(bad.status, 1);
  assert.ok(!(bad.stderr + bad.stdout).includes(secret));
});
