import test from 'node:test';
import assert from 'node:assert/strict';
import { DBC_REQUIREMENTS as R, rawAmount, checkSupplyAccounting, checkFeeAndCustodyPolicy, dbcStage } from './policy.mjs';

const supply = () => ({ initialSupplyRaw: R.totalSupplyRaw,
  nominalCurveAllocationRaw: R.nominalCurveAllocationRaw,
  grossMigrationAllocationRaw: R.grossMigrationAllocationRaw, extraInitialIssuanceRaw: 0n });
const policy = () => ({ migrationTarget: 'DAMM_V2', bondingFeeBps: 100,
  bondingDynamicFeeEnabled: false, bondingCollection: 'QUOTE_TOKEN',
  migratedFeeBps: 100, migratedDynamicFeeEnabled: false, migratedCollection: 'OUTPUT_TOKEN',
  additionalMigrationFeeBps: 0, additionalPoolCreationFeeRaw: '0', permanentlyLockedLiquidityBps: 10000,
  creatorPostMigrationQuoteBps: 5000, kydosPostMigrationQuoteBps: 5000,
  launchControlledBaseBurnBps: 10000, feeRightsCustody: 'SETTLEMENT_PROGRAM_PDA',
  discretionaryCreatorLpBps: 0, discretionaryTreasuryLpBps: 0 });

test('approved allocation is exactly 1B with six decimals', () => {
  assert.equal(R.nominalCurveAllocationRaw + R.grossMigrationAllocationRaw, R.totalSupplyRaw);
  assert.equal(checkSupplyAccounting(supply()).accountingMatches, true);
  assert.equal(checkSupplyAccounting(supply()).releaseReady, false);
});
test('rejects silent additional initial supply for a swap buffer', () => {
  const s = supply(); s.extraInitialIssuanceRaw = 198_275_000_000_000n; s.initialSupplyRaw += s.extraInitialIssuanceRaw;
  const r = checkSupplyAccounting(s);
  assert.equal(r.accountingMatches, false);
  assert.ok(r.errors.includes('UNAPPROVED_INITIAL_ISSUANCE'));
});
test('does not substitute 800M/200M for approved allocation', () => {
  const s = supply(); s.nominalCurveAllocationRaw = 800_000_000_000_000n;
  s.grossMigrationAllocationRaw = 200_000_000_000_000n;
  assert.equal(checkSupplyAccounting(s).accountingMatches, false);
});
test('one raw-unit difference needs explicit reconciliation, not a silent tolerance', () => {
  const s = supply(); s.nominalCurveAllocationRaw -= 1n; s.grossMigrationAllocationRaw += 1n;
  assert.equal(checkSupplyAccounting(s).accountingMatches, false);
});
test('net migration deposit must not be represented as gross allocation', () => {
  const s = supply(); s.grossMigrationAllocationRaw = s.grossMigrationAllocationRaw * 998n / 1000n;
  assert.equal(checkSupplyAccounting(s).accountingMatches, false);
});
test('canonical decimal strings are accepted, numbers are not', () => {
  assert.equal(rawAmount('1000000000000000'), R.totalSupplyRaw);
  assert.equal(rawAmount('0'), 0n);
  for (const value of [1, -1n, 1.5, undefined, null, '', '00', '+1', ' 1', '1 ', '1e9', '1.0', (1n << 64n)]) {
    assert.throws(() => rawAmount(value));
  }
});
test('large legitimate u64 values are exact', () => {
  assert.equal(rawAmount('18446744073709551615'), (1n << 64n) - 1n);
});
test('supply inputs cannot be missing or inherited via numeric coercion', () => {
  assert.throws(() => checkSupplyAccounting(null));
  assert.throws(() => checkSupplyAccounting({}));
  assert.throws(() => rawAmount({ toString: () => '1' }));
});
test('matching fee policy still does not establish deployment readiness', () => {
  assert.equal(checkFeeAndCustodyPolicy(policy()).policyMatches, true);
  assert.equal(checkFeeAndCustodyPolicy(policy()).releaseReady, false);
});
for (const [key, value] of Object.entries({ migrationTarget: 'DAMM_V1', bondingFeeBps: 125,
  bondingDynamicFeeEnabled: true, bondingCollection: 'OUTPUT_TOKEN', migratedFeeBps: 125,
  migratedDynamicFeeEnabled: true, migratedCollection: 'QUOTE_TOKEN', additionalMigrationFeeBps: 1,
  additionalPoolCreationFeeRaw: '1', permanentlyLockedLiquidityBps: 9999,
  creatorPostMigrationQuoteBps: 4999, kydosPostMigrationQuoteBps: 5001,
  launchControlledBaseBurnBps: 9999, feeRightsCustody: 'TREASURY_WALLET',
  discretionaryCreatorLpBps: 5000, discretionaryTreasuryLpBps: 1 })) {
  test(`rejects policy drift: ${key}`, () => {
    const r = checkFeeAndCustodyPolicy({ ...policy(), [key]: value });
    assert.equal(r.policyMatches, false); assert.ok(r.errors.includes(`POLICY_MISMATCH:${key}`));
  });
}
test('empty or partial policy cannot pass', () => {
  assert.equal(checkFeeAndCustodyPolicy({}).policyMatches, false);
  assert.throws(() => checkFeeAndCustodyPolicy(null));
});
test('curve completion does not imply a verified live AMM', () => {
  const state = { migrationProgress: 0, quoteReserveRaw: 84n, thresholdRaw: 85n };
  assert.equal(dbcStage(state), 'BONDING');
  assert.equal(dbcStage({ ...state, quoteReserveRaw: 85n }), 'MIGRATION_PENDING');
  assert.equal(dbcStage({ ...state, quoteReserveRaw: 100n }), 'MIGRATION_PENDING');
  assert.equal(dbcStage({ ...state, migrationProgress: 1 }), 'VESTING_SETUP_REQUIRED');
  assert.equal(dbcStage({ ...state, migrationProgress: 2 }), 'MIGRATION_PENDING');
  assert.equal(dbcStage({ ...state, migrationProgress: 3 }), 'MIGRATED_STATE_REQUIRES_POOL_VERIFICATION');
});
test('lifecycle refuses unknown states and a zero threshold', () => {
  for (const v of [-1, 4, 1.5, '3', null]) assert.throws(() => dbcStage({ migrationProgress: v, quoteReserveRaw: 1n, thresholdRaw: 1n }));
  assert.throws(() => dbcStage({ migrationProgress: 0, quoteReserveRaw: 1n, thresholdRaw: 0n }));
});
test('requirements and results are immutable', () => {
  assert.ok(Object.isFrozen(R));
  const result = checkSupplyAccounting(supply());
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.errors));
});
