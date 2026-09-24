// Reproduce independent expectations with the exact official SDK dev dependency.
// No Kydos implementation imports, network requests, validator or wallet required.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BorshAccountsCoder, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import * as sdk from '@meteora-ag/cp-amm-sdk';

const require = createRequire(import.meta.url);
// The SDK's CommonJS entry uses this Decimal instance, not decimal.mjs's instance.
const Decimal = require('decimal.js');
const version = JSON.parse(readFileSync(require.resolve('@meteora-ag/cp-amm-sdk/package.json'), 'utf8')).version;
assert.equal(version, '1.4.10');
const originalPrecision = Decimal.precision;
Decimal.set({ precision: 120 }); // Test oracle only; SDK's 20-digit default loses Q64 low bits.
const bn = value => new BN(value.toString());
const min = sdk.MIN_SQRT_PRICE, max = sdk.MAX_SQRT_PRICE;
const budgets = [
  ['one-lamport', '206900000000000', '1'],
  ['small', '206900000000000', '1000'],
  ['one-sol', '206900000000000', '1000000000'],
  ['completion', '206900000000000', '85005359057'],
  ['completion-minus-one', '206900000000000', '85005359056'],
  ['completion-plus-one', '206900000000000', '85005359058'],
  ['path-dependent', '206900000000000', '86000000000'],
  ['max-sol', '206900000000000', '18446744073709551615'],
  ['tiny', '1', '1'],
  ['max-a', '18446744073709551615', '1'],
  ['max-b', '1', '18446744073709551615'],
  ['rounding-dust', '10000000000000000000', '10000000000000000000'],
];
const seeds = budgets.map(([name, a, b]) => {
  const sqrtPrice = sdk.calculateInitSqrtPrice(bn(a), bn(b), min, max);
  const fromA = sdk.getLiquidityDeltaFromAmountAForConcentratedLiquidity(bn(a), sqrtPrice, max);
  const fromB = sdk.getLiquidityDeltaFromAmountBForConcentratedLiquidity(bn(b), min, sqrtPrice);
  const liquidity = BN.min(fromA, fromB);
  const amounts = sdk.getInitialConcentratedLiquidityPoolInformation(min, max, sqrtPrice, liquidity);
  return { name, tokenA: a, tokenB: b, sqrtPrice: sqrtPrice.toString(), liquidity: liquidity.toString(),
    tokenAAmount: amounts.tokenAAmount.toString(), tokenBAmount: amounts.tokenBAmount.toString(),
    tokenADust: bn(a).sub(amounts.tokenAAmount).toString(), tokenBDust: bn(b).sub(amounts.tokenBAmount).toString() };
});
Decimal.set({ precision: originalPrecision });

// Encode the zero-copy config through the pinned IDL, including explicit padding.
function zero(type) {
  if (type === 'pubkey') return PublicKey.default;
  if (typeof type === 'string') return ['u64', 'u128'].includes(type) ? bn(0) : 0;
  if (type.array) return Array.from({ length: type.array[1] }, () => zero(type.array[0]));
  const definition = sdk.CpAmmIdl.types.find(t => t.name === type.defined.name);
  return Object.fromEntries(definition.type.fields.map(f => [f.name, zero(f.type)]));
}
const configCoder = new BorshAccountsCoder(sdk.CpAmmIdl);
const program = new Program(sdk.CpAmmIdl, { connection: new Connection('http://127.0.0.1:8899') });
const addressCases = [];
for (const [mintByte, programByte, index] of [[1, 7, '1'], [254, 8, '18446744073709551615']]) {
  const launchpad = new PublicKey(Buffer.alloc(32, programByte));
  const mint = new PublicKey(Buffer.alloc(32, mintByte));
  const config = sdk.deriveConfigAddress(bn(index));
  const local = seeds => PublicKey.findProgramAddressSync(seeds, launchpad)[0];
  const curve = local([Buffer.from('curve'), mint.toBuffer()]);
  const forCurve = seed => local([Buffer.from(seed), curve.toBuffer()]);
  const nft = forCurve('meteora_position_mint');
  const pool = sdk.derivePoolAddress(config, mint, NATIVE_MINT);
  const addresses = { mint, config, curve, pool,
    receipt: forCurve('migration_receipt'), payer: forCurve('migration_payer'),
    poolCreatorAuthority: local([Buffer.from('meteora_pool_creator')]),
    positionOwner: forCurve('meteora_position_owner'), positionNftMint: nft,
    tokenAStaging: local([Buffer.from('migration_token'), curve.toBuffer(), mint.toBuffer()]),
    tokenBStaging: local([Buffer.from('migration_token'), curve.toBuffer(), NATIVE_MINT.toBuffer()]),
    poolAuthority: sdk.derivePoolAuthority(), position: sdk.derivePositionAddress(nft),
    positionNftAccount: sdk.derivePositionNftAccount(nft),
    tokenAVault: sdk.deriveTokenVaultAddress(mint, pool), tokenBVault: sdk.deriveTokenVaultAddress(NATIVE_MINT, pool),
    eventAuthority: PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], sdk.CP_AMM_PROGRAM_ID)[0],
  };
  const configData = await configCoder.encode('Config', { ...zero({ defined: { name: 'Config' } }),
    pool_creator_authority: addresses.poolCreatorAuthority, config_type: 1, index: bn(index) });
  assert.equal(configData.length, 328);
  const quote = seeds.find(s => s.name === 'completion');
  const instruction = await program.methods.initializePoolWithDynamicConfig({
    poolFees: { baseFee: sdk.getFeeTimeSchedulerParams(100, 100, sdk.BaseFeeMode.FeeTimeSchedulerLinear, 0, 0),
      compoundingFeeBps: 0, padding: 0, dynamicFee: null },
    sqrtMinPrice: min, sqrtMaxPrice: max, hasAlphaVault: false,
    liquidity: bn(quote.liquidity), sqrtPrice: bn(quote.sqrtPrice),
    activationType: sdk.ActivationType.Timestamp, collectFeeMode: sdk.CollectFeeMode.BothToken, activationPoint: null,
  }).accountsStrict({
    creator: addresses.positionOwner, positionNftMint: nft, positionNftAccount: addresses.positionNftAccount,
    payer: addresses.payer, poolCreatorAuthority: addresses.poolCreatorAuthority, config,
    poolAuthority: addresses.poolAuthority, pool, position: addresses.position, tokenAMint: mint, tokenBMint: NATIVE_MINT,
    tokenAVault: addresses.tokenAVault, tokenBVault: addresses.tokenBVault,
    payerTokenA: addresses.tokenAStaging, payerTokenB: addresses.tokenBStaging,
    tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, token2022Program: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId, eventAuthority: addresses.eventAuthority, program: sdk.CP_AMM_PROGRAM_ID,
  }).instruction();
  addressCases.push({ launchpad: launchpad.toBase58(), configIndex: index,
    addresses: Object.fromEntries(Object.entries(addresses).map(([k, v]) => [k, v.toBase58()])),
    configDataHex: configData.toString('hex'),
    initialize: { seed: quote.name, programId: instruction.programId.toBase58(), dataHex: instruction.data.toString('hex'),
      accounts: instruction.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })) } });
}
const fixture = {
  schemaVersion: 2, sdkVersion: version, sdkRevision: '37cd9e690d7b5fb6182638a21b86e0e1bf636a7e',
  programRevision: 'a85c926607433f23f0ea60f4ca7b1ae92f4156cb',
  idlVersion: sdk.CpAmmIdl.metadata.version,
  // Canonical JSON hash also pins the complete IDL carried by the npm package.
  idlJsonSha256: createHash('sha256').update(JSON.stringify(sdk.CpAmmIdl)).digest('hex'),
  minSqrtPrice: min.toString(), maxSqrtPrice: max.toString(), oracleDecimalPrecision: 120,
  feePolicy: { baseFeeBps: 100, collectFeeMode: 'BothToken', expectedProtocolFeePercent: 20,
    expectedKydosFeeBps: 80, extraMigrationFeeBps: 0, lockPolicy: 'permanent' },
  seeds, addressCases,
};
const target = new URL('../tests/fixtures/meteora-v2.json', import.meta.url);
if (process.argv.includes('--write')) writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`);
else assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), fixture, 'Meteora SDK fixture drift');
console.log(`Meteora ${version}: ${seeds.length} seed vectors, ${addressCases.length} config/address/instruction fixtures verified`);
