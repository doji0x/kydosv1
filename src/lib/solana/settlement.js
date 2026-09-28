/**
 * Offline accounting only: does not claim, transfer, burn, or authenticate accounts.
 * Inputs are SPL token amounts from validated accounts before/after a fee-claim CPI.
 * quoteDust is persisted protocol state, never a caller-selected allowance.
 */
export const SETTLEMENT_POLICY_VERSION = 1;
const U64_MAX = (1n << 64n) - 1n;

function tokenAmount(value, name) {
  if (typeof value !== 'bigint') throw new TypeError(`${name} must be a bigint`);
  if (value < 0n || value > U64_MAX) throw new RangeError(`${name} must fit u64`);
  return value;
}

/** Burn claimed base; split net claimed quote equally, retaining at most one raw unit. */
export function planFeeSettlement({ baseBefore, baseAfter, quoteBefore, quoteAfter, quoteDust }) {
  for (const [name, value] of Object.entries({ baseBefore, baseAfter, quoteBefore, quoteAfter, quoteDust })) {
    tokenAmount(value, name);
  }
  if (quoteDust > 1n) throw new RangeError('quoteDust must be zero or one');
  if (quoteBefore < quoteDust) throw new RangeError('persisted quote dust is not funded');
  if (baseAfter < baseBefore || quoteAfter < quoteBefore) {
    throw new RangeError('fee claim decreased a token balance');
  }
  const baseFeesReceived = baseAfter - baseBefore;
  const quoteFeesReceived = quoteAfter - quoteBefore;
  // quoteDust <= quoteBefore implies distributable <= quoteAfter <= u64::MAX.
  const distributable = quoteFeesReceived + quoteDust;
  const each = distributable / 2n;
  return Object.freeze({
    baseFeesReceived,
    baseToBurn: baseFeesReceived,
    quoteFeesReceived,
    creatorQuote: each,
    kydosQuote: each,
    nextQuoteDust: distributable % 2n,
  });
}
