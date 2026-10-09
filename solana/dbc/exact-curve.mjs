/** Integer reconciliation of the approved nominal allocations. No signing or RPC. */
import BN from 'bn.js';
import { MIN_SQRT_PRICE, MAX_SQRT_PRICE, MigrationOption, Rounding,
  getMigrationBaseToken, getInitialLiquidityFromDeltaQuote,
  getDeltaAmountBaseUnsigned, getDeltaAmountQuoteUnsigned,
  getMigrationThresholdPrice, getBaseTokenForSwap, getTotalSupplyFromCurve,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { DBC_REQUIREMENTS as R } from './policy.mjs';
const bn = value => new BN(value.toString());
const integer = value => BigInt(value.toString());

// Each monotone search is bounded by the bit length of the price range.
function firstTrue(low, high, predicate) {
  if (low > high || !predicate(high)) throw new Error('No price satisfies the allocation');
  while (low < high) {
    const middle = (low + high) >> 1n;
    if (predicate(middle)) high = middle;
    else low = middle + 1n;
  }
  return low;
}
function requireEqual(actual, expected, label) {
  if (integer(actual) !== expected) throw new Error(`${label} is not exactly representable`);
}

/**
 * Preserve the SDK-built policy; replace only the curve's prices/liquidity.
 * The percentage helper approximates a full-range AMM with price=B/A, which
 * omits its finite range boundaries. Invert the SDK's actual integer migration
 * function instead, then solve a finite curve ending at that migration price.
 * This caps buffer capacity at the approved curve allocation, not 125% of it.
 * It fixes NOMINAL configuration amounts, not per-trade rounding or overshoot.
 */
export function reconcileNominalCurve(parameters) {
  if (parameters.migrationOption !== MigrationOption.MET_DAMM_V2 ||
      parameters.migrationFee.feePercentage !== 0) throw new Error('Unsupported migration policy');
  requireEqual(parameters.tokenSupply.preMigrationTokenSupply, R.totalSupplyRaw, 'Initial supply');
  requireEqual(parameters.tokenSupply.postMigrationTokenSupply, R.totalSupplyRaw, 'Supply parameter');
  requireEqual(parameters.migrationQuoteThreshold, R.candidateMigrationThresholdRaw, 'Quote threshold');
  const minimum = integer(MIN_SQRT_PRICE) + 1n;
  const maximum = integer(MAX_SQRT_PRICE) - 1n;
  const quote = bn(R.candidateMigrationThresholdRaw);
  const upper = firstTrue(minimum, maximum, price => integer(getMigrationBaseToken(
    quote, bn(price), MigrationOption.MET_DAMM_V2)) <= R.grossMigrationAllocationRaw);
  const liquidityAt = lower => getInitialLiquidityFromDeltaQuote(quote, bn(lower), bn(upper));
  const lower = firstTrue(minimum, upper - 1n, price => integer(getDeltaAmountBaseUnsigned(
    bn(price), bn(upper), liquidityAt(price), Rounding.Up)) <= R.nominalCurveAllocationRaw);
  const liquidity = liquidityAt(lower);
  const result = { ...parameters, sqrtStartPrice: bn(lower),
    curve: [{ sqrtPrice: bn(upper), liquidity }] };
  const migrationPrice = getMigrationThresholdPrice(quote, result.sqrtStartPrice, result.curve);
  requireEqual(migrationPrice, upper, 'Migration price');
  requireEqual(getMigrationBaseToken(quote, migrationPrice, MigrationOption.MET_DAMM_V2),
    R.grossMigrationAllocationRaw, 'Gross migration allocation');
  requireEqual(getBaseTokenForSwap(result.sqrtStartPrice, migrationPrice, result.curve),
    R.nominalCurveAllocationRaw, 'Curve allocation');
  requireEqual(getDeltaAmountQuoteUnsigned(result.sqrtStartPrice, migrationPrice, liquidity, Rounding.Up),
    R.candidateMigrationThresholdRaw, 'Curve quote capacity');
  requireEqual(getTotalSupplyFromCurve(quote, result.sqrtStartPrice, result.curve,
    parameters.lockedVesting, parameters.migrationOption, bn(0), 0), R.totalSupplyRaw, 'Buffered supply');
  return result;
}
