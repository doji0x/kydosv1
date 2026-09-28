// Shared Rust vectors are checked independently against the EXACT official SDK.
// No RPC, wallet, validator or transaction submission is used here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/meteora-permissionless.json', import.meta.url), 'utf8'));
const discriminator = name => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const u128 = (data, offset) => data.readBigUInt64LE(offset) + (data.readBigUInt64LE(offset + 8) << 64n);
const normalize = ix => ({ programId: ix.programId.toBase58(), dataHex: ix.data.toString('hex'),
  accounts: ix.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })) });

// These fixture-sanity checks can also run locally without the SDK dependencies.
// They are NOT a substitute for the SDK parity and Rust tests below/in CI.
test('fixture: exact instruction discriminators and sizes', () => {
  for (const c of fixture.cases) {
    const init = Buffer.from(c.initialize.dataHex, 'hex'), lock = Buffer.from(c.permanentLock.dataHex, 'hex');
    assert.equal(init.length, 107); assert.equal(lock.length, 24);
    assert.deepEqual(init.subarray(0, 8), discriminator('initialize_customizable_pool'));
    assert.deepEqual(lock.subarray(0, 8), discriminator('permanent_lock_position'));
    assert.equal(c.initialize.accounts.length, 19); assert.equal(c.permanentLock.accounts.length, 6);
  }
});
test('fixture: fixed 1% BothToken policy with no dynamic fee or AlphaVault', () => {
  for (const c of fixture.cases) {
    const data = Buffer.from(c.initialize.dataHex, 'hex');
    assert.equal(data.readBigUInt64LE(8), 10_000_000n);
    assert.deepEqual(data.subarray(16, 39), Buffer.alloc(23));
    assert.equal(u128(data, 39), 4_295_048_016n);
    assert.equal(u128(data, 55), 79_226_673_521_066_979_257_578_248_091n);
    assert.equal(data[71], 0);
    assert.deepEqual(data.subarray(104), Buffer.from([1, 0, 0]));
  }
});
test('fixture: lock all seeded liquidity with program-owned position signer', () => {
  for (const c of fixture.cases) {
    const init = Buffer.from(c.initialize.dataHex, 'hex'), lock = Buffer.from(c.permanentLock.dataHex, 'hex');
    assert.equal(u128(init, 72), BigInt(c.liquidity));
    assert.equal(u128(init, 88), BigInt(c.sqrtPrice));
    assert.equal(u128(lock, 8), BigInt(c.liquidity));
    assert.deepEqual(c.initialize.accounts.filter(a => a.isSigner).map(a => a.pubkey),
      [c.addresses.positionNftMint, c.addresses.payer]);
    assert.deepEqual(c.permanentLock.accounts.filter(a => a.isSigner).map(a => a.pubkey), [c.addresses.positionOwner]);
    assert.equal(c.initialize.accounts[0].pubkey, c.addresses.positionOwner);
  }
});
test('fixture: no config or operator authority and two mint-sort directions', () => {
  assert.deepEqual(fixture.cases.map(c => c.name), ['mint-1', 'mint-254']);
  for (const c of fixture.cases) {
    assert.equal(Object.keys(c.addresses).length, 15);
    assert.equal('config' in c.addresses, false);
    assert.equal('poolCreatorAuthority' in c.addresses, false);
    assert.ok(BigInt(c.tokenA) > 0n && BigInt(c.tokenB) > 0n);
  }
});

let oraclePromise;
function oracle() {
  oraclePromise ??= (async () => {
    const [anchor, web3, token, bnModule, sdk] = await Promise.all([
      import('@coral-xyz/anchor'), import('@solana/web3.js'), import('@solana/spl-token'),
      import('bn.js'), import('@meteora-ag/cp-amm-sdk'),
    ]);
    const connection = new web3.Connection('http://127.0.0.1:8899');
    connection._rpcRequest = async () => { throw new Error('SDK parity must not call RPC'); };
    connection._rpcBatchRequest = connection._rpcRequest;
    return { web3, token, sdk, bn: value => new bnModule.default(value.toString()),
      program: new anchor.Program(sdk.CpAmmIdl, { connection }) };
  })();
  return oraclePromise;
}

test('SDK: pinned version and canonical IDL hash', async () => {
  const { sdk } = await oracle();
  const require = createRequire(import.meta.url);
  const pkg = JSON.parse(readFileSync(require.resolve('@meteora-ag/cp-amm-sdk/package.json'), 'utf8'));
  assert.equal(pkg.version, fixture.sdkVersion);
  assert.equal(pkg.version, '1.4.10');
  assert.equal(createHash('sha256').update(JSON.stringify(sdk.CpAmmIdl)).digest('hex'), fixture.idlJsonSha256);
});
for (const c of fixture.cases) {
  test(`SDK: ${c.name} canonical PDA and custody parity`, async () => {
    const { sdk, web3, token } = await oracle();
    const { PublicKey } = web3;
    const lp = new PublicKey(c.launchpad);
    const a = Object.fromEntries(Object.entries(c.addresses).map(([n, v]) => [n, new PublicKey(v)]));
    const local = seeds => PublicKey.findProgramAddressSync(seeds, lp)[0];
    const curve = local([Buffer.from('curve'), a.mint.toBuffer()]);
    const fc = name => local([Buffer.from(name), curve.toBuffer()]);
    const pool = sdk.deriveCustomizablePoolAddress(a.mint, token.NATIVE_MINT);
    const expected = { mint: a.mint, curve, pool,
      receipt: fc('migration_receipt'), payer: fc('migration_payer'),
      positionOwner: fc('meteora_position_owner'), positionNftMint: fc('meteora_position_mint'),
      tokenAStaging: local([Buffer.from('migration_token'), curve.toBuffer(), a.mint.toBuffer()]),
      tokenBStaging: local([Buffer.from('migration_token'), curve.toBuffer(), token.NATIVE_MINT.toBuffer()]),
      poolAuthority: sdk.derivePoolAuthority(), position: sdk.derivePositionAddress(a.positionNftMint),
      positionNftAccount: sdk.derivePositionNftAccount(a.positionNftMint),
      tokenAVault: sdk.deriveTokenVaultAddress(a.mint, pool), tokenBVault: sdk.deriveTokenVaultAddress(token.NATIVE_MINT, pool),
      eventAuthority: PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], sdk.CP_AMM_PROGRAM_ID)[0],
    };
    assert.deepEqual(Object.fromEntries(Object.entries(expected).map(([n, v]) => [n, v.toBase58()])), c.addresses);
    assert.equal(sdk.deriveCustomizablePoolAddress(token.NATIVE_MINT, a.mint).toBase58(), pool.toBase58());
  });
  test(`SDK: ${c.name} complete initialization and permanent-lock ABI parity`, async () => {
    const { sdk, web3, token, program, bn } = await oracle();
    const a = Object.fromEntries(Object.entries(c.addresses).map(([n, v]) => [n, new web3.PublicKey(v)]));
    const initialize = await program.methods.initializeCustomizablePool({
      poolFees: { baseFee: sdk.getFeeTimeSchedulerParams(100, 100, sdk.BaseFeeMode.FeeTimeSchedulerLinear, 0, 0),
        compoundingFeeBps: 0, padding: 0, dynamicFee: null },
      sqrtMinPrice: sdk.MIN_SQRT_PRICE, sqrtMaxPrice: sdk.MAX_SQRT_PRICE, hasAlphaVault: false,
      liquidity: bn(c.liquidity), sqrtPrice: bn(c.sqrtPrice),
      activationType: sdk.ActivationType.Timestamp, collectFeeMode: sdk.CollectFeeMode.BothToken, activationPoint: null,
    }).accountsStrict({
      creator: a.positionOwner, positionNftMint: a.positionNftMint, positionNftAccount: a.positionNftAccount,
      payer: a.payer, poolAuthority: a.poolAuthority, pool: a.pool, position: a.position,
      tokenAMint: a.mint, tokenBMint: token.NATIVE_MINT, tokenAVault: a.tokenAVault, tokenBVault: a.tokenBVault,
      payerTokenA: a.tokenAStaging, payerTokenB: a.tokenBStaging,
      tokenAProgram: token.TOKEN_PROGRAM_ID, tokenBProgram: token.TOKEN_PROGRAM_ID, token2022Program: token.TOKEN_2022_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId, eventAuthority: a.eventAuthority, program: sdk.CP_AMM_PROGRAM_ID,
    }).instruction();
    const lock = await program.methods.permanentLockPosition(bn(c.liquidity)).accountsStrict({
      pool: a.pool, position: a.position, positionNftAccount: a.positionNftAccount,
      signer: a.positionOwner, eventAuthority: a.eventAuthority, program: sdk.CP_AMM_PROGRAM_ID,
    }).instruction();
    assert.deepEqual(normalize(initialize), c.initialize);
    assert.deepEqual(normalize(lock), c.permanentLock);
  });
}
