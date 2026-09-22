import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { LIQUIDITY_TOKENS } from '../../src/lib/solana/curveMath.js';
import { quoteSeedLiquidity, deriveMigrationAddresses, deriveConfigAddress, validatePrivateConfig,
  DAMM_PROGRAM_ID, WSOL_MINT, MIN_SQRT_PRICE, MAX_SQRT_PRICE } from '../../src/lib/solana/meteora.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/meteora-v2.json', import.meta.url), 'utf8'));
const U64_MAX = (1n << 64n) - 1n;
const ceil = (n, d) => (n + d - 1n) / d;

test('integer seeding matches official SDK golden vectors, including u64 extremes', () => {
  assert.equal(MIN_SQRT_PRICE.toString(), fixture.minSqrtPrice);
  assert.equal(MAX_SQRT_PRICE.toString(), fixture.maxSqrtPrice);
  for (const row of fixture.seeds) {
    const quote = quoteSeedLiquidity(BigInt(row.tokenA), BigInt(row.tokenB));
    for (const [key, value] of Object.entries(quote)) assert.equal(value.toString(), row[key], `${row.name}: ${key}`);
  }
});

test('seed price brackets the exact root and liquidity never exceeds either budget', () => {
  let state = 317n;
  for (let i = 0; i < 128; i++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & U64_MAX;
    const a = LIQUIDITY_TOKENS, b = state || 1n, q = quoteSeedLiquidity(a, b);
    const polynomial = s => a * MAX_SQRT_PRICE * s * (s - MIN_SQRT_PRICE)
      - b * (1n << 128n) * (MAX_SQRT_PRICE - s);
    assert.ok(polynomial(q.sqrtPrice) <= 0n && polynomial(q.sqrtPrice + 1n) > 0n);
    assert.equal(q.tokenAAmount + q.tokenADust, a);
    assert.equal(q.tokenBAmount + q.tokenBDust, b);
    const nextA = ceil((q.liquidity + 1n) * (MAX_SQRT_PRICE - q.sqrtPrice), q.sqrtPrice * MAX_SQRT_PRICE);
    const nextB = ceil((q.liquidity + 1n) * (q.sqrtPrice - MIN_SQRT_PRICE), 1n << 128n);
    assert.ok(nextA > a || nextB > b, 'one more liquidity unit must exceed a budget');
  }
});

test('seeding rejects zero, noninteger/unsafe input and u128 liquidity overflow', () => {
  for (const bad of [0n, -1n, U64_MAX + 1n, 1, Number.MAX_VALUE, '1', null]) {
    assert.throws(() => quoteSeedLiquidity(bad, 1n));
    assert.throws(() => quoteSeedLiquidity(1n, bad));
  }
  assert.throws(() => quoteSeedLiquidity(U64_MAX, U64_MAX), /bounds/);
});

test('canonical addresses match SDK in both mint sort directions and isolate source programs', () => {
  for (const row of fixture.addressCases) {
    const { mint, config } = row.addresses;
    const result = deriveMigrationAddresses(row.launchpad, mint, config);
    assert.deepEqual(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.toBase58()])), row.addresses);
    assert.equal(deriveConfigAddress(BigInt(row.configIndex)).toBase58(), config);
    const other = deriveMigrationAddresses(SystemProgram.programId, mint, config);
    // DAMM pool is config/pair-specific; Kydos positions and receipts are source-program-specific.
    assert.equal(other.pool.toBase58(), result.pool.toBase58());
    for (const name of ['receipt', 'payer', 'positionOwner', 'positionNftMint', 'position', 'tokenAStaging', 'tokenBStaging', 'poolCreatorAuthority']) {
      assert.notEqual(other[name].toBase58(), result[name].toBase58());
      assert.equal(PublicKey.isOnCurve(result[name].toBytes()), false);
    }
    assert.throws(() => deriveMigrationAddresses(row.launchpad, WSOL_MINT, config));
  }
});

test('private config validation rejects substitutions, public/static configs and altered layouts', () => {
  for (const row of fixture.addressCases) {
    const account = { owner: DAMM_PROGRAM_ID, executable: false, data: Buffer.from(row.configDataHex, 'hex') };
    const args = { address: row.addresses.config, approvedConfig: row.addresses.config,
      creatorAuthority: row.addresses.poolCreatorAuthority, account };
    assert.equal(validatePrivateConfig(args).index, BigInt(row.configIndex));
    for (const override of [{ address: WSOL_MINT }, { approvedConfig: WSOL_MINT }, { creatorAuthority: WSOL_MINT }, { account: null },
      { account: { ...account, owner: SystemProgram.programId } }, { account: { ...account, executable: true } },
      { account: { ...account, data: account.data.subarray(0, 327) } }, { account: { ...account, data: Buffer.concat([account.data, Buffer.alloc(1)]) } }]) {
      assert.throws(() => validatePrivateConfig({ ...args, ...override }));
    }
    // Discriminator, AlphaVault, authority, config type, index, permission.
    for (const offset of [0, 8, 40, 202, 208, 248]) {
      const data = Buffer.from(account.data); data[offset] ^= 1;
      assert.throws(() => validatePrivateConfig({ ...args, account: { ...account, data } }), `offset ${offset}`);
    }
    const publicData = Buffer.from(account.data); publicData.fill(0, 40, 72);
    assert.throws(() => validatePrivateConfig({ ...args, account: { ...account, data: publicData } }));
    assert.throws(() => validatePrivateConfig({ ...args, creatorAuthority: PublicKey.default,
      account: { ...account, data: publicData } }));
  }
});
