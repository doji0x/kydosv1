import test from 'node:test';
import { PROGRAM_ADDRESS } from '../../base44/shared/solanaProtocol.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSolanaDevelopmentConfig } from '../../src/lib/solana/index.js';

const example = JSON.parse(readFileSync(
  new URL('../config/localnet.example.json', import.meta.url), 'utf8',
));

// Importing the public entry point requires neither Vite nor a wallet/RPC SDK.
test('checked-in example agrees with the client configuration contract', () => {
  const result = readSolanaDevelopmentConfig(example);
  assert.deepEqual(result, {
    cluster: 'localnet', rpcUrl: 'http://127.0.0.1:8899/',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(example.rpcUrl, 'http://127.0.0.1:8899');
});

test('accepts loopback host variants without making network requests', () => {
  for (const rpcUrl of ['http://localhost:8899', 'http://[::1]:8899']) {
    assert.equal(readSolanaDevelopmentConfig({ cluster: 'localnet', rpcUrl }).rpcUrl,
      `${rpcUrl}/`);
  }
});

test('requires explicit local configuration; never falls back to a live cluster', () => {
  for (const input of [undefined, null, {},
    { ...example, cluster: 'devnet' },
    { ...example, cluster: 'mainnet-beta' },
    { ...example, rpcUrl: undefined },
    { ...example, rpcUrl: '' }]) {
    assert.throws(() => readSolanaDevelopmentConfig(input));
  }
});

test('rejects malformed, remote and credential-bearing URLs without echoing input', () => {
  for (const rpcUrl of [
    'invalid-sensitive-value',
    'https://rpc.example.invalid',
    'http://localhost.example.invalid:8899',
    'file:///tmp/rpc',
    'ws://localhost:8900',
    'http://user:private-value@localhost:8899',
    'http://localhost:8899/?api-key=private-value',
    'http://localhost:8899/#private-value',
    'http://localhost:8899/private-value',
  ]) {
    assert.throws(() => readSolanaDevelopmentConfig({ ...example, rpcUrl }),
      (error) => error instanceof Error && !error.message.includes(rpcUrl)
        && !error.message.includes('private-value'));
  }
});

test('copies only public contract fields, not arbitrary environment values', () => {
  const result = readSolanaDevelopmentConfig({ ...example, unrelated: 'omit' });
  assert.deepEqual(Object.keys(result).sort(), ['cluster', 'rpcUrl']);
});

test('Rust, localnet config, browser IDL and admin launcher use one program identity', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const idl = JSON.parse(read('../../src/lib/solana/idl/kydos_launchpad.json'));
  const rust = read('../programs/kydos_launchpad/src/lib.rs');
  const anchor = read('../Anchor.toml');
  const admin = read('../../base44/functions/adminLaunchToken/entry.ts');
  assert.equal(rust.match(/declare_id!\("([^"]+)"\)/)[1], idl.address);
  assert.equal(anchor.match(/kydos_launchpad = "([^"]+)"/)[1], idl.address);
  assert.equal(PROGRAM_ADDRESS, idl.address);
  assert.match(admin, /const PROGRAM_ID = new PublicKey\(PROGRAM_ADDRESS\)/);
  assert.match(anchor, /cluster = "localnet"/, 'validator tests must stay local');
});
