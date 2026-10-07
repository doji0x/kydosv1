/**
 * OFFLINE CANDIDATE ONLY. No connection, private key, signing or submission.
 * Uses the official SDK, and reports its calculated amounts rather than copying
 * requested allocations into a purportedly verified report.
 */
import Decimal from 'decimal.js';
import { PublicKey } from '@solana/web3.js';
import {
  buildCurve, validateConfigParameters, getMigrationThresholdPrice,
  getMigrationBaseToken, getBaseTokenForSwap, getSwapAmountWithBuffer,
  getTotalSupplyFromCurve, getProtocolMigrationFee,
  ActivationType, BaseFeeMode, CollectFeeMode, MigrationOption, MigrationFeeOption,
  TokenType, TokenAuthorityOption, TokenDecimal, MigratedCollectFeeMode,
  DammV2DynamicFeeMode, DammV2BaseFeeMode,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { DBC_REQUIREMENTS as R, checkSupplyAccounting } from './policy.mjs';

export const SDK_VERSION = '1.5.13';
export const REVIEWED_SDK_REVISION = 'a28b7239e71899eb52ff7aacac4dec90441885c4';
export const DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const QUOTE_MINT = 'So11111111111111111111111111111111111111112';
export const CANDIDATE_PRECISION = 80;

// SDK helpers use Decimal's shared context. Scope and restore our precision so
// importing this isolated module does not change the application's arithmetic.
function precise(fn) {
  const previous = { precision: Decimal.precision, rounding: Decimal.rounding };
  Decimal.set({ precision: CANDIDATE_PRECISION, rounding: Decimal.ROUND_HALF_UP });
  try { return fn(); } finally { Decimal.set(previous); }
}

/** Return fresh params; no caller-controlled economics or production addresses. */
export function candidateInputs() {
  return {
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE, tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 } },
      dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0, poolCreationFee: 0, enableFirstSwapWithMinFee: false },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: { collectFeeMode: MigratedCollectFeeMode.OutputToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled, poolFeeBps: 100,
        baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear } },
    liquidityDistribution: { partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 0 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: 20.69,
    migrationQuoteThreshold: 85.005359057,
  };
}

export function buildCandidateParameters() {
  return precise(() => buildCurve(candidateInputs()));
}

/**
 * Report the official SDK's nominal threshold math. This is NOT actual executed
 * swaps, final-buy rounding/overshoot, deployed account validation or a release.
 * The 20-bps protocol deduction below is an explicit illustrative assumption;
 * production must use verified on-chain settings and measured balance changes.
 */
export function inspectCandidate() {
  return precise(() => {
    const parameters = buildCurve(candidateInputs());
    const placeholder = new PublicKey(new Uint8Array(32).fill(9));
    validateConfigParameters({ ...parameters, leftoverReceiver: placeholder });
    const migrationSqrtPrice = getMigrationThresholdPrice(parameters.migrationQuoteThreshold,
      parameters.sqrtStartPrice, parameters.curve);
    const grossBase = getMigrationBaseToken(parameters.migrationQuoteThreshold, migrationSqrtPrice,
      parameters.migrationOption); // zero additional migration fee in this candidate
    const curveBase = getBaseTokenForSwap(parameters.sqrtStartPrice, migrationSqrtPrice, parameters.curve);
    const bufferedBase = getSwapAmountWithBuffer(curveBase, parameters.sqrtStartPrice, parameters.curve);
    const requiredSupply = getTotalSupplyFromCurve(parameters.migrationQuoteThreshold,
      parameters.sqrtStartPrice, parameters.curve, parameters.lockedVesting,
      parameters.migrationOption, parameters.tokenSupply.preMigrationTokenSupply.sub(
        parameters.tokenSupply.preMigrationTokenSupply), 0);
    const initial = BigInt(parameters.tokenSupply.preMigrationTokenSupply.toString());
    const supply = { initialSupplyRaw: initial,
      nominalCurveAllocationRaw: BigInt(curveBase.toString()),
      grossMigrationAllocationRaw: BigInt(grossBase.toString()),
      extraInitialIssuanceRaw: initial > R.totalSupplyRaw ? initial - R.totalSupplyRaw : 0n };
    const accounting = checkSupplyAccounting(supply);
    const [baseProtocolFee, quoteProtocolFee] = getProtocolMigrationFee(grossBase,
      parameters.migrationQuoteThreshold, migrationSqrtPrice, 20, parameters.migrationOption);
    const deltaCurve = supply.nominalCurveAllocationRaw - R.nominalCurveAllocationRaw;
    const deltaMigration = supply.grossMigrationAllocationRaw - R.grossMigrationAllocationRaw;
    const remainder = initial - supply.nominalCurveAllocationRaw - supply.grossMigrationAllocationRaw;
    const report = {
      schemaVersion: 1, sdkVersion: SDK_VERSION, reviewedSdkRevision: REVIEWED_SDK_REVISION,
      evidence: 'OFFLINE_SDK_CALCULATION_AND_VALIDATION', decimalPrecision: CANDIDATE_PRECISION,
      sdkValidationPassed: true, onChainValidationPassed: false, releaseReady: false,
      initialSupplyRaw: initial.toString(),
      postMigrationSupplyParameterRaw: parameters.tokenSupply.postMigrationTokenSupply.toString(),
      nominalCurveAllocationRaw: curveBase.toString(), grossMigrationAllocationRaw: grossBase.toString(),
      requestedCurveAllocationRaw: R.nominalCurveAllocationRaw.toString(),
      requestedMigrationAllocationRaw: R.grossMigrationAllocationRaw.toString(),
      curveAllocationDeltaRaw: deltaCurve.toString(), migrationAllocationDeltaRaw: deltaMigration.toString(),
      unallocatedAtNominalThresholdRaw: remainder.toString(),
      extraInitialIssuanceRaw: supply.extraInitialIssuanceRaw.toString(),
      bufferedSwapCapacityRaw: bufferedBase.toString(), minimumSupplyWithBufferRaw: requiredSupply.toString(),
      migrationQuoteThresholdRaw: parameters.migrationQuoteThreshold.toString(),
      migrationSqrtPrice: migrationSqrtPrice.toString(), curveSegments: parameters.curve.length,
      exactRequestedAllocationsMatch: accounting.accountingMatches,
      accountingErrors: [...accounting.errors],
      illustrativeProtocolDeduction: { assumedBps: 20,
        baseRaw: baseProtocolFee.toString(), quoteRaw: quoteProtocolFee.toString(),
        netBaseRaw: grossBase.sub(baseProtocolFee).toString(),
        netQuoteRaw: parameters.migrationQuoteThreshold.sub(quoteProtocolFee).toString(),
        isObservedOnChain: false },
      missingReleaseEvidence: ['Executed DBC creation/trading/graduation tests',
        'Final-buy rounding, surplus and net deposits', 'Deployed settlement PDA with verified fee-claim capability',
        'Immutable creator entitlement binding and actual base burn / equal quote payouts',
        'Target-cluster configuration and deployed-program compatibility'],
    };
    if (!accounting.accountingMatches) report.missingReleaseEvidence.unshift('Exact allocation reconciliation; no tolerance authorized');
    if (BigInt(requiredSupply.toString()) > initial) report.missingReleaseEvidence.unshift('Required buffer exceeds initial supply');
    return { parameters, report };
  });
}

/** Preserve BN values as decimal, never use BN.toJSON's hexadecimal encoding. */
export function toPlain(value) {
  if (value && typeof value === 'object' && value.constructor?.name === 'BN') return value.toString(10);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,toPlain(v)]));
  return value;
}
