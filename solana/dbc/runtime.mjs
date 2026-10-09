/** Execute DBC -> DAMM with real pinned bytecode on a disposable local validator.
 * Synthetic genesis: wallets + DBC-authorized DAMM config. NOT production setup.
 * Ephemeral wallet fee owner tests protocol behavior, NOT Kydos PDA settlement.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint, getAccount,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction, createCloseAccountInstruction } from '@solana/spl-token';
import BN from 'bn.js';
import * as sdk from '@meteora-ag/dynamic-bonding-curve-sdk';
import { buildCandidateParameters, SDK_VERSION, REVIEWED_SDK_REVISION, DBC_PROGRAM_ID } from './candidate.mjs';
import { DBC_REQUIREMENTS as R } from './policy.mjs';
import { FIXTURES, verifyFixture, executor, snapshot } from './runtime-support.mjs';

if (process.argv.length !== 2) throw new Error('Runtime accepts no arguments or public endpoint');
const bn = x => new BN(x.toString());
const amount = x => BigInt(x.toString());
const DBC = new PublicKey(DBC_PROGRAM_ID);
const DAMM = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');
const root = resolve('runtime/fixtures'), output = resolve('runtime-results');
mkdirSync(output, { recursive: true });
const fixtureIdentity = Object.fromEntries(Object.entries(FIXTURES).map(([name, pin]) => [name, verifyFixture(join(root, name), pin)]));
const validator = process.env.SOLANA_TEST_VALIDATOR || 'solana-test-validator';
const validatorVersion = execFileSync(validator, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
assert.match(validatorVersion, /^solana-test-validator 2\.1\.21 /);
const dir = mkdtempSync(join(tmpdir(), 'kydos-dbc-'));
const log = join(dir, 'validator.log'), fd = openSync(log, 'w');
const connection = new Connection('http://127.0.0.1:18899', 'confirmed');
const client = sdk.DynamicBondingCurveClient.create(connection, 'confirmed');
const amm = sdk.createDammV2Program(connection);
const payer = Keypair.generate(), creator = Keypair.generate(), partner = Keypair.generate(), trader = Keypair.generate();
const configArguments = [];
function genesis(name, key, data, owner, lamports = 100000000) {
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify({ pubkey: key.toBase58(), account: {
    lamports, data: [data.toString('base64'), 'base64'], owner: owner.toBase58(), executable: false, rentEpoch: 0,
  } }));
  configArguments.push('--account', key.toBase58(), path);
}
for (const [i, wallet] of [payer, creator, partner, trader].entries()) {
  genesis(`wallet-${i}`, wallet.publicKey, Buffer.alloc(0), SystemProgram.programId, 1000e9);
}
// This config only models the existing DBC-owned migration route in our isolated
// ledger. It does NOT create or request a Kydos-specific protected DAMM config.
const dammConfig = sdk.DAMM_V2_MIGRATION_FEE_ADDRESS[sdk.MigrationFeeOption.Customizable];
const configBytes = Buffer.alloc(328);
createHash('sha256').update('account:Config').digest().copy(configBytes, 0, 0, 8);
sdk.deriveDbcPoolAuthority().toBuffer().copy(configBytes, 40);
configBytes[202] = 1;
genesis('synthetic-dbc-migration-config', dammConfig, configBytes, DAMM);
const run = executor(connection), passes = [], scenarios = [];
const pass = text => { passes.push(text); console.log(`PASS ${text}`); };
let child, failure;
async function send(tx, signers = [payer], options = {}) { return run.send(tx, signers, options); }
async function rejected(name, tx, signers, keys, program = DBC_PROGRAM_ID) {
  const before = await snapshot(connection, keys);
  const result = await send(tx, signers, { program, succeeds: false });
  assert.deepEqual(await snapshot(connection, keys), before, 'Failed transaction modified custody/state');
  pass(name);
  return result;
}
const eventAuthority = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], DAMM)[0];

async function swapBase(pool, isSell, input, mode = sdk.SwapMode.ExactIn, minimum = 1n) {
  return client.pool.swap2({ pool, swapBaseForQuote: isSell, swapMode: mode, owner: trader.publicKey,
    referralTokenAccount: null, amountIn: bn(input), minimumAmountOut: bn(minimum) });
}
async function migratedSwap(pool, state, mint, isSell) {
  const baseAta = getAssociatedTokenAddressSync(mint, trader.publicKey);
  const quoteAta = getAssociatedTokenAddressSync(NATIVE_MINT, trader.publicKey);
  const input = isSell ? 1000000n : 10000000n;
  const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(
    trader.publicKey, quoteAta, trader.publicKey, NATIVE_MINT));
  if (!isSell) tx.add(SystemProgram.transfer({ fromPubkey: trader.publicKey, toPubkey: quoteAta, lamports: input }),
    createSyncNativeInstruction(quoteAta));
  tx.add(await amm.methods.swap({ amountIn: bn(input), minimumAmountOut: bn(1) }).accountsStrict({
    poolAuthority: sdk.deriveDammV2PoolAuthority(), pool,
    inputTokenAccount: isSell ? baseAta : quoteAta, outputTokenAccount: isSell ? quoteAta : baseAta,
    tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault,
    tokenAMint: mint, tokenBMint: NATIVE_MINT, payer: trader.publicKey,
    tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null,
    eventAuthority, program: DAMM,
  }).instruction());
  tx.add(createCloseAccountInstruction(quoteAta, trader.publicKey, trader.publicKey));
  return send(tx, [trader], { program: DAMM.toBase58() });
}

async function lifecycle(name, roundTrip) {
  const p = buildCandidateParameters(), config = Keypair.generate(), mint = Keypair.generate();
  const pool = sdk.deriveDbcPoolAddress(NATIVE_MINT, mint.publicKey, config.publicKey);
  const baseVault = sdk.deriveDbcTokenVaultAddress(pool, mint.publicKey);
  const quoteVault = sdk.deriveDbcTokenVaultAddress(pool, NATIVE_MINT);
  const target = sdk.deriveDammV2PoolAddress(dammConfig, mint.publicKey, NATIVE_MINT);
  const create = await client.partner.createConfig({ ...p, config: config.publicKey, payer: payer.publicKey,
    feeClaimer: partner.publicKey, leftoverReceiver: partner.publicKey, quoteMint: NATIVE_MINT });
  if (!roundTrip) {
    const invalid = new Transaction().add(...create.instructions);
    invalid.instructions[0] = new TransactionInstruction({ ...create.instructions[0], data: client.partner.program.coder.instruction.encode('createConfig', {
      configParameters: { ...p, tokenSupply: { preMigrationTokenSupply: bn(1), postMigrationTokenSupply: bn(1) } },
    }) });
    await rejected(`${name}: insufficient initial supply rejected`, invalid, [payer, config], [config.publicKey]);
  }
  await send(create, [payer, config], { program: DBC_PROGRAM_ID });
  const cfg = await client.state.getPoolConfig(config.publicKey);
  assert.equal(amount(cfg.migrationBaseThreshold), R.grossMigrationAllocationRaw);
  assert.equal(amount(cfg.migrationQuoteThreshold), R.candidateMigrationThresholdRaw);
  assert.equal(amount(cfg.preMigrationTokenSupply), R.totalSupplyRaw);
  assert.equal(amount(cfg.postMigrationTokenSupply), R.totalSupplyRaw);
  assert.equal(cfg.partnerPermanentLockedLiquidityPercentage, 100);
  assert.equal(cfg.partnerLiquidityPercentage + cfg.creatorLiquidityPercentage + cfg.creatorPermanentLockedLiquidityPercentage, 0);
  assert.equal(cfg.feeClaimer.toBase58(), partner.publicKey.toBase58());
  pass(`${name}: exact nominal allocations accepted by DBC config creation`);
  const creation = await client.creator.createPool({ config: config.publicKey, baseMint: mint.publicKey,
    name: 'Kydos isolated DBC test', symbol: 'KYTEST', uri: 'https://example.invalid/kydos-test.json',
    payer: payer.publicKey, poolCreator: creator.publicKey });
  await send(creation, [payer, creator, mint], { program: DBC_PROGRAM_ID });
  const minted = await getMint(connection, mint.publicKey);
  assert.equal(minted.supply, R.totalSupplyRaw); assert.equal(minted.decimals, 6);
  assert.equal(minted.mintAuthority, null); assert.equal(minted.freezeAuthority, null);
  const state0 = (await client.state.getPool(pool)).poolState;
  assert.equal(state0.baseMint.toBase58(), mint.publicKey.toBase58());
  assert.equal(state0.creator.toBase58(), creator.publicKey.toBase58());
  assert.equal((await getAccount(connection, baseVault)).owner.toBase58(), sdk.deriveDbcPoolAuthority().toBase58());
  assert.equal((await getAccount(connection, baseVault)).amount, R.totalSupplyRaw);
  pass(`${name}: one-billion SPL mint and canonical DBC custody; authorities revoked`);
  const prepared = await client.migration.migrateToDammV2({ pool, dammConfig, payer: payer.publicKey });
  const signers = [payer, prepared.firstPositionNftKeypair, prepared.secondPositionNftKeypair];
  const position = sdk.derivePositionAddress(prepared.firstPositionNftKeypair.publicKey);
  const nftAccount = sdk.derivePositionNftAccount(prepared.firstPositionNftKeypair.publicKey);
  const secondPosition = sdk.derivePositionAddress(prepared.secondPositionNftKeypair.publicKey);
  const av = sdk.deriveDammV2TokenVaultAddress(target, mint.publicKey), bv = sdk.deriveDammV2TokenVaultAddress(target, NATIVE_MINT);
  const protectedKeys = [pool, baseVault, quoteVault, mint.publicKey, target, av, bv, position, secondPosition,
    prepared.firstPositionNftKeypair.publicKey, nftAccount, sdk.deriveDbcPoolAuthority()];
  await rejected(`${name}: premature migration preserves reserves`, prepared.transaction, signers, protectedKeys);
  const impossibleBuy = await swapBase(pool, false, 1000000000n, sdk.SwapMode.ExactIn, R.totalSupplyRaw);
  await rejected(`${name}: slippage failure rolls back swaps and account creation`, impossibleBuy, [trader], protectedKeys);
  await send(await swapBase(pool, false, 1000000000n), [trader], { program: DBC_PROGRAM_ID });
  let state = (await client.state.getPool(pool)).poolState;
  assert.ok(amount(state.quoteReserve) > 0n);
  assert.ok(amount(state.partnerQuoteFee) > 0n && amount(state.protocolQuoteFee) > 0n);
  assert.equal(amount(state.partnerBaseFee), 0n);
  pass(`${name}: buy accrues quote fees outside tracked reserves`);
  const traderAta = getAssociatedTokenAddressSync(mint.publicKey, trader.publicKey);
  if (roundTrip) {
    const tokens = (await getAccount(connection, traderAta)).amount;
    await send(await swapBase(pool, true, tokens / 2n), [trader], { program: DBC_PROGRAM_ID });
    assert.ok((await getAccount(connection, traderAta)).amount < tokens);
    assert.ok(amount((await client.state.getPool(pool)).poolState.quoteReserve) < amount(state.quoteReserve));
    pass(`${name}: sell returns quote and reverses reserve progress`);
  }
  const tooLarge = await swapBase(pool, false, 100000000000n);
  await rejected(`${name}: excessive exact-input final buy fails without reserve loss`, tooLarge, [trader], protectedKeys);
  const beforeBuyer = BigInt(await connection.getBalance(trader.publicKey));
  await send(await swapBase(pool, false, 100000000000n, sdk.SwapMode.PartialFill), [trader], { program: DBC_PROGRAM_ID });
  state = (await client.state.getPool(pool)).poolState;
  assert.equal(state.migrationProgress, 2);
  assert.ok(amount(state.quoteReserve) >= R.candidateMigrationThresholdRaw);
  assert.equal(await connection.getAccountInfo(target), null, 'Curve complete is not yet AMM live');
  assert.ok(beforeBuyer - BigInt(await connection.getBalance(trader.publicKey)) < 100000000000n);
  const beforeBase = (await getAccount(connection, baseVault)).amount;
  const beforeQuote = (await getAccount(connection, quoteVault)).amount;
  const circulated = (await getAccount(connection, traderAta)).amount;
  assert.equal(circulated + beforeBase, R.totalSupplyRaw);
  assert.equal(beforeQuote, amount(state.quoteReserve) + amount(state.protocolQuoteFee) + amount(state.partnerQuoteFee) + amount(state.creatorQuoteFee));
  pass(`${name}: partial-fill completion accounts for unspent input, rounding and fee balances`);
  if (!roundTrip) {
    await rejected(`${name}: missing protocol flash-rent balance cannot strand reserves`, prepared.transaction, signers, protectedKeys);
    // Only local test setup. Production must inspect DBC's existing rent reserve,
    // not blindly transfer SOL to this address or charge token liquidity principal.
    await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey,
      toPubkey: sdk.deriveDbcPoolAuthority(), lamports: 1000000000 })), [payer]);
    pass('isolated DBC flash-rent reserve funded separately from liquidity principal');
  }
  const lateFailure = new Transaction().add(...prepared.transaction.instructions, SystemProgram.transfer({
    fromPubkey: payer.publicKey, toPubkey: trader.publicKey, lamports: 5000e9,
  }));
  const failed = await rejected(`${name}: failure after complete migration rolls back pool, locks and source balances`, lateFailure, signers, protectedKeys);
  assert.ok(failed.meta.logMessages.includes(`Program ${DBC_PROGRAM_ID} success`));
  const rentBefore = await connection.getBalance(sdk.deriveDbcPoolAuthority());
  const migration = await send(prepared.transaction, signers, { program: DBC_PROGRAM_ID });
  assert.equal(await connection.getBalance(sdk.deriveDbcPoolAuthority()), rentBefore, 'Migration payer must replenish flash rent');
  const after = (await client.state.getPool(pool)).poolState;
  assert.equal(after.migrationProgress, 3);
  const damm = await amm.account.pool.fetch(target), pos = await amm.account.position.fetch(position);
  assert.equal(damm.tokenAMint.toBase58(), mint.publicKey.toBase58());
  assert.equal(damm.tokenBMint.toBase58(), NATIVE_MINT.toBase58());
  assert.equal(damm.tokenAVault.toBase58(), av.toBase58()); assert.equal(damm.tokenBVault.toBase58(), bv.toBase58());
  assert.equal(pos.pool.toBase58(), target.toBase58());
  assert.equal(amount(pos.permanentLockedLiquidity), amount(damm.liquidity));
  assert.equal(amount(damm.permanentLockLiquidity), amount(damm.liquidity));
  assert.equal(amount(pos.unlockedLiquidity), 0n); assert.equal(amount(pos.vestedLiquidity), 0n);
  const nft = await getAccount(connection, nftAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
  assert.equal(nft.owner.toBase58(), partner.publicKey.toBase58()); assert.equal(nft.amount, 1n);
  assert.equal(await connection.getAccountInfo(secondPosition), null);
  assert.equal(damm.collectFeeMode, 0, 'DAMM BothToken enum differs from DBC OutputToken enum');
  assert.equal(damm.poolFees.compoundingFeeBps, 0);
  assert.equal(damm.poolFees.dynamicFee.initialized, 0);
  const poolData = (await connection.getAccountInfo(target)).data;
  assert.equal(poolData.readBigUInt64LE(8), 10000000n, 'Fixed 100-bps numerator');
  pass(`${name}: DAMM pool has fixed BothToken fees and 100% permanently locked initial liquidity`);
  const depositedBase = (await getAccount(connection, av)).amount, depositedQuote = (await getAccount(connection, bv)).amount;
  const residualBase = (await getAccount(connection, baseVault)).amount, residualQuote = (await getAccount(connection, quoteVault)).amount;
  assert.equal(beforeBase, depositedBase + residualBase);
  assert.equal(beforeQuote, depositedQuote + residualQuote);
  const [baseFee, quoteFee] = sdk.getProtocolMigrationFee(cfg.migrationBaseThreshold,
    cfg.migrationQuoteThreshold, cfg.migrationSqrtPrice, state.protocolLiquidityMigrationFeeBps, sdk.MigrationOption.MET_DAMM_V2);
  assert.equal(amount(after.protocolMigrationBaseFeeAmount), amount(baseFee));
  assert.equal(amount(after.protocolMigrationQuoteFeeAmount), amount(quoteFee));
  assert.equal((await getMint(connection, mint.publicKey)).supply, R.totalSupplyRaw);
  pass(`${name}: gross budgets, actual protocol deductions, net deposits and residuals conserve assets`);
  await rejected(`${name}: duplicate migration cannot seed again`, prepared.transaction, signers, protectedKeys);
  await migratedSwap(target, damm, mint.publicKey, false);
  let traded = await amm.account.pool.fetch(target);
  assert.ok(amount(traded.protocolAFee) > 0n); assert.equal(amount(traded.protocolBFee), 0n);
  await migratedSwap(target, traded, mint.publicKey, true);
  traded = await amm.account.pool.fetch(target);
  assert.ok(amount(traded.protocolBFee) > 0n);
  assert.equal(amount((await amm.account.position.fetch(position)).unlockedLiquidity), 0n);
  pass(`${name}: buys and sells execute after migration, accrue both assets, and do not unlock liquidity`);
  scenarios.push({ name, initialSupplyRaw: minted.supply.toString(), nominalCurveAllocationRaw: R.nominalCurveAllocationRaw.toString(),
    configMigrationBaseThresholdRaw: cfg.migrationBaseThreshold.toString(),
    finalQuoteReserveRaw: state.quoteReserve.toString(), quoteSurplusRaw: (amount(state.quoteReserve) - R.candidateMigrationThresholdRaw).toString(),
    circulatedAtCompletionRaw: circulated.toString(), actualBaseAtCompletionRaw: beforeBase.toString(),
    actualCurveVsNominalDeltaRaw: (circulated - R.nominalCurveAllocationRaw).toString(),
    protocolMigrationBps: state.protocolLiquidityMigrationFeeBps,
    protocolMigrationBaseFeeRaw: after.protocolMigrationBaseFeeAmount.toString(),
    protocolMigrationQuoteFeeRaw: after.protocolMigrationQuoteFeeAmount.toString(),
    netBaseDepositRaw: depositedBase.toString(), netQuoteDepositRaw: depositedQuote.toString(),
    residualBaseRaw: residualBase.toString(), residualQuoteRaw: residualQuote.toString(),
    initialLiquidity: damm.liquidity.toString(), permanentlyLockedLiquidity: pos.permanentLockedLiquidity.toString(),
    migrationComputeUnits: migration.meta.computeUnitsConsumed,
    feeOwner: 'EPHEMERAL_TEST_WALLET_NOT_PRODUCTION_SETTLEMENT', settlementImplemented: false });
}
try {
  child = spawn(validator, ['--reset', '--quiet', '--ledger', join(dir, 'ledger'), '--rpc-port', '18899',
    '--faucet-port', '18901', '--gossip-port', '18902', '--dynamic-port-range', '18910-18940', '--bind-address', '127.0.0.1',
    '--bpf-program', DBC_PROGRAM_ID, join(root, 'dynamic_bonding_curve.so'),
    '--bpf-program', DAMM.toBase58(), join(root, 'cp_amm.so'),
    '--bpf-program', 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', join(root, 'metaplex.so'), ...configArguments,
  ], { stdio: ['ignore', fd, fd] });
  let spawnError; child.on('error', error => { spawnError = error; });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error('Private validator exited early');
    try { await connection.getLatestBlockhash(); ready = true; break; } catch { await delay(200); }
  }
  assert.ok(ready, 'Private validator failed to start');
  assert.equal(await connection.getBalance(payer.publicKey), 1000e9, 'Not the disposable test ledger');
  assert.equal(await connection.getAccountInfo(new PublicKey('GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE')), null);
  pass('verified pinned programs on disposable local ledger; no legacy Kydos program loaded');
  await lifecycle('buy-only', false);
  await lifecycle('buy-sell-buy', true);
  assert.equal(passes.length, 29, 'Every planned lifecycle case must execute');
  assert.equal(scenarios.length, 2);
} catch (error) {
  failure = error;
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([exited, delay(1000)]); }
  }
  closeSync(fd);
  writeFileSync(join(output, 'validator.log'), readFileSync(log));
  writeFileSync(join(output, 'lifecycle-report.json'), JSON.stringify({ schemaVersion: 1, succeeded: !failure,
    passedCases: passes.length, cases: passes, sdkVersion: SDK_VERSION, reviewedSdkRevision: REVIEWED_SDK_REVISION,
    validatorVersion, fixtureIdentity, scenarios, transactions: run.measurements,
    releaseReady: false, limitations: ['Synthetic genesis migration config; not a live deployment match',
      'Fee owner is an ephemeral test wallet; Kydos PDA fee settlement is not implemented',
      'Frontend/keeper not connected; production lifecycle and signer approval remain unverified'],
    error: failure?.message,
  }, null, 2) + '\n');
  rmSync(dir, { recursive: true, force: true });
}
if (!failure) console.log(`DBC runtime completed: ${passes.length} executed cases; no public-network transactions.`);
