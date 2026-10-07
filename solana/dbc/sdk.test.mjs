import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { PublicKey, Connection } from '@solana/web3.js';
import { DynamicBondingCurveClient, DynamicBondingCurveIdl, CollectFeeMode,
  MigrationOption, MigrationFeeOption, MigratedCollectFeeMode, DammV2DynamicFeeMode,
  TokenAuthorityOption, validateConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { SDK_VERSION, DBC_PROGRAM_ID, QUOTE_MINT, candidateInputs,
  buildCandidateParameters, inspectCandidate, toPlain } from './candidate.mjs';
import { DBC_REQUIREMENTS as R, checkSupplyAccounting } from './policy.mjs';

const publicFixture = byte => new PublicKey(new Uint8Array(32).fill(byte));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('actual installed SDK and program ID match the selected pin', () => {
  const pkg = JSON.parse(readFileSync(new URL('./node_modules/@meteora-ag/dynamic-bonding-curve-sdk/package.json',import.meta.url)));
  assert.equal(pkg.version, SDK_VERSION);
  assert.equal(DynamicBondingCurveIdl.address, DBC_PROGRAM_ID);
});
test('SDK candidate validates and keeps exact initial supply and threshold', () => {
  const p = buildCandidateParameters();
  assert.doesNotThrow(() => validateConfigParameters({ ...p, leftoverReceiver: publicFixture(9) }));
  assert.equal(p.tokenSupply.preMigrationTokenSupply.toString(), R.totalSupplyRaw.toString());
  assert.equal(p.tokenSupply.postMigrationTokenSupply.toString(), R.totalSupplyRaw.toString());
  assert.equal(p.migrationQuoteThreshold.toString(), R.candidateMigrationThresholdRaw.toString());
  assert.equal(p.tokenDecimal, 6);
  assert.equal(p.tokenUpdateAuthority, TokenAuthorityOption.Immutable);
});
test('bonding and migrated pools use distinct named fee enums', () => {
  const p = buildCandidateParameters();
  assert.equal(p.collectFeeMode, CollectFeeMode.QuoteToken);
  assert.equal(p.poolFees.dynamicFee, null);
  assert.equal(p.poolFees.baseFee.cliffFeeNumerator.toString(), '10000000');
  assert.equal(p.creatorTradingFeePercentage, 0); // initial bonding-phase candidate, not the post-migration entitlement
  assert.equal(p.migrationOption, MigrationOption.MET_DAMM_V2);
  assert.equal(p.migrationFeeOption, MigrationFeeOption.Customizable);
  assert.equal(p.migratedPoolFee.collectFeeMode, MigratedCollectFeeMode.OutputToken);
  assert.equal(p.migratedPoolFee.dynamicFee, DammV2DynamicFeeMode.Disabled);
  assert.equal(p.migratedPoolFee.poolFeeBps, 100);
  assert.equal(p.compoundingFeeBps, 0);
});
test('no extra creation/migration charge or unrestricted LP allocation', () => {
  const p = buildCandidateParameters();
  assert.equal(p.poolCreationFee.toString(), '0');
  assert.deepEqual(p.migrationFee, { feePercentage: 0, creatorFeePercentage: 0 });
  assert.equal(p.partnerPermanentLockedLiquidityPercentage, 100);
  assert.equal(p.partnerLiquidityPercentage, 0);
  assert.equal(p.creatorLiquidityPercentage, 0);
  assert.equal(p.creatorPermanentLockedLiquidityPercentage, 0);
});
test('candidate inputs cannot be mutated to change subsequent builds', () => {
  const inputs = candidateInputs(); inputs.token.totalTokenSupply = 2_000_000_000;
  assert.equal(candidateInputs().token.totalTokenSupply, 1_000_000_000);
});
test('precision changes are scoped and SDK calculation is deterministic', () => {
  const previous = Decimal.precision;
  const a = hash(toPlain(buildCandidateParameters()));
  assert.equal(Decimal.precision, previous);
  const b = hash(toPlain(buildCandidateParameters()));
  assert.equal(a,b);
  inspectCandidate(); assert.equal(Decimal.precision, previous);
});
test('allocation acceptance is computed from SDK output, never a copied success flag', () => {
  const { report:r } = inspectCandidate();
  const outcome = checkSupplyAccounting({ initialSupplyRaw:r.initialSupplyRaw,
    nominalCurveAllocationRaw:r.nominalCurveAllocationRaw, grossMigrationAllocationRaw:r.grossMigrationAllocationRaw,
    extraInitialIssuanceRaw:r.extraInitialIssuanceRaw });
  assert.equal(r.exactRequestedAllocationsMatch, outcome.accountingMatches);
  assert.deepEqual(r.accountingErrors, [...outcome.errors]);
  assert.equal(BigInt(r.curveAllocationDeltaRaw), BigInt(r.nominalCurveAllocationRaw) - R.nominalCurveAllocationRaw);
  assert.equal(BigInt(r.migrationAllocationDeltaRaw), BigInt(r.grossMigrationAllocationRaw) - R.grossMigrationAllocationRaw);
  if (!outcome.accountingMatches) assert.ok(r.missingReleaseEvidence.some(e => e.includes('allocation reconciliation')));
});
test('projected protocol deductions conserve gross budgets and are not burn evidence', () => {
  const { report:r } = inspectCandidate(), f = r.illustrativeProtocolDeduction;
  assert.equal(BigInt(f.netBaseRaw) + BigInt(f.baseRaw), BigInt(r.grossMigrationAllocationRaw));
  assert.equal(BigInt(f.netQuoteRaw) + BigInt(f.quoteRaw), BigInt(r.migrationQuoteThresholdRaw));
  assert.equal(f.isObservedOnChain, false);
});
test('SDK validation and passing unit tests never enable production creation', () => {
  const { report:r } = inspectCandidate();
  assert.equal(r.releaseReady, false); assert.equal(r.onChainValidationPassed, false);
  assert.ok(r.missingReleaseEvidence.length >= 5);
  assert.equal('feeClaimer' in buildCandidateParameters(), false);
});
test('configuration transaction builds unsigned without any RPC or Kydos instruction', async () => {
  let rpcCalls = 0;
  const connection = new Connection('http://127.0.0.1:1','confirmed');
  connection._rpcRequest = async () => { rpcCalls++; throw new Error('No RPC allowed'); };
  connection._rpcBatchRequest = connection._rpcRequest;
  const client = DynamicBondingCurveClient.create(connection,'confirmed');
  const config = publicFixture(3), payer = publicFixture(4), feeClaimer = publicFixture(5), leftoverReceiver = publicFixture(6);
  const p = buildCandidateParameters();
  const tx = await client.partner.createConfig({ ...p, config, payer, feeClaimer, leftoverReceiver,
    quoteMint: new PublicKey(QUOTE_MINT) });
  assert.equal(rpcCalls,0);
  assert.equal(tx.instructions.length,1);
  assert.equal(tx.instructions[0].programId.toBase58(),DBC_PROGRAM_ID);
  const signerKeys = tx.instructions[0].keys.filter(k => k.isSigner).map(k => k.pubkey.toBase58()).sort();
  assert.deepEqual(signerKeys,[config.toBase58(),payer.toBase58()].sort());
  assert.ok(tx.signatures.every(s => s.signature === null));
  const decoded = client.partner.program.coder.instruction.decode(tx.instructions[0].data);
  assert.equal(decoded.name.replaceAll('_','').toLowerCase(),'createconfig');
  assert.ok(tx.instructions[0].data.length > 8);
});
