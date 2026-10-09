/**
 * DBC economic acceptance checks, not a launch client or on-chain enforcement.
 * Normalize actual SDK/validator results into the inputs below. Passing these
 * checks does not authenticate accounts, prove a deployment, or authorize signing.
 * Nothing in this module opens a network connection or moves funds.
 */
export const DBC_REQUIREMENTS = Object.freeze({
  version: 1,
  baseDecimals: 6,
  quoteDecimals: 9,
  totalSupplyRaw: 1_000_000_000_000_000n,
  nominalCurveAllocationRaw: 793_100_000_000_000n,
  grossMigrationAllocationRaw: 206_900_000_000_000n,
  // Retained candidate threshold from Kydos, NOT Bags's rounded 85 SOL.
  candidateMigrationThresholdRaw: 85_005_359_057n,
  bondingFeeBps: 100,
  migratedFeeBps: 100,
  creatorPostMigrationQuoteBps: 5000,
  kydosPostMigrationQuoteBps: 5000,
  launchControlledBaseBurnBps: 10000,
});

const U64_MAX = (1n << 64n) - 1n;

/** Raw token units: reject floating-point numbers and implicit coercions. */
export function rawAmount(value, name = 'amount') {
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) value = BigInt(value);
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) {
    throw new TypeError(`${name} must be bigint or a canonical unsigned u64 decimal string`);
  }
  return value;
}

/**
 * Require exact approved nominal allocations. SDK rounding differences must be
 * reported for review, not silently accepted by increasing a tolerance here.
 * The migration allocation is GROSS, before protocol deductions.
 */
export function checkSupplyAccounting(report) {
  if (!report || typeof report !== 'object') throw new TypeError('Supply report required');
  const amounts = {};
  for (const key of ['initialSupplyRaw', 'nominalCurveAllocationRaw',
    'grossMigrationAllocationRaw', 'extraInitialIssuanceRaw']) {
    amounts[key] = rawAmount(report[key], key);
  }
  const errors = [];
  if (amounts.initialSupplyRaw !== DBC_REQUIREMENTS.totalSupplyRaw) errors.push('INITIAL_SUPPLY_MISMATCH');
  if (amounts.nominalCurveAllocationRaw !== DBC_REQUIREMENTS.nominalCurveAllocationRaw) errors.push('CURVE_ALLOCATION_MISMATCH');
  if (amounts.grossMigrationAllocationRaw !== DBC_REQUIREMENTS.grossMigrationAllocationRaw) errors.push('MIGRATION_ALLOCATION_MISMATCH');
  if (amounts.extraInitialIssuanceRaw !== 0n) errors.push('UNAPPROVED_INITIAL_ISSUANCE');
  if (amounts.nominalCurveAllocationRaw + amounts.grossMigrationAllocationRaw !== amounts.initialSupplyRaw) {
    errors.push('ALLOCATION_DOES_NOT_CONSERVE_SUPPLY');
  }
  return Object.freeze({ accountingMatches: errors.length === 0, errors: Object.freeze(errors),
    releaseReady: false,
  });
}

/**
 * Check normalized fee/custody settings separately from SDK enum numbers.
 * DBC MigratedCollectFeeMode.OutputToken is not DAMM CollectFeeMode.BothToken's
 * numeric value. Use SDK enum names in the eventual transaction builder.
 */
export function checkFeeAndCustodyPolicy(report) {
  if (!report || typeof report !== 'object') throw new TypeError('Policy report required');
  const expected = {
    migrationTarget: 'DAMM_V2',
    bondingFeeBps: 100,
    bondingDynamicFeeEnabled: false,
    bondingCollection: 'QUOTE_TOKEN',
    migratedFeeBps: 100,
    migratedDynamicFeeEnabled: false,
    migratedCollection: 'OUTPUT_TOKEN',
    additionalMigrationFeeBps: 0,
    additionalPoolCreationFeeRaw: '0',
    permanentlyLockedLiquidityBps: 10000,
    creatorPostMigrationQuoteBps: 5000,
    kydosPostMigrationQuoteBps: 5000,
    launchControlledBaseBurnBps: 10000,
    feeRightsCustody: 'SETTLEMENT_PROGRAM_PDA',
    discretionaryCreatorLpBps: 0,
    discretionaryTreasuryLpBps: 0,
  };
  const errors = Object.entries(expected)
    .filter(([key, value]) => report[key] !== value)
    .map(([key]) => `POLICY_MISMATCH:${key}`);
  return Object.freeze({ policyMatches: errors.length === 0, errors: Object.freeze(errors), releaseReady: false });
}

/** Display guidance only, not canonical-pool verification or transaction permission. */
export function dbcStage({ migrationProgress, quoteReserveRaw, thresholdRaw }) {
  if (!Number.isInteger(migrationProgress) || migrationProgress < 0 || migrationProgress > 3) {
    throw new RangeError('Unknown DBC migration progress');
  }
  const reserve = rawAmount(quoteReserveRaw, 'quoteReserveRaw');
  const threshold = rawAmount(thresholdRaw, 'thresholdRaw');
  if (threshold === 0n) throw new RangeError('Migration threshold must be positive');
  if (migrationProgress === 3) return 'MIGRATED_STATE_REQUIRES_POOL_VERIFICATION';
  if (migrationProgress === 1) return 'VESTING_SETUP_REQUIRED';
  if (migrationProgress === 2 || reserve >= threshold) return 'MIGRATION_PENDING';
  return 'BONDING';
}
