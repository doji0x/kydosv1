import { quoteCurve } from './curveMath.js';

export const FEE_POLICY_VERSION = 1;
export const TRADING_FEE_BPS = 100;
export const TREASURY_ADDRESS = '5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg';
const BPS = 10_000n;
const U64_MAX = (1n << 64n) - 1n;
/** @param {bigint} n @param {bigint} d */
const ceilDiv = (n, d) => n / d + (n % d === 0n ? 0n : 1n);
const checked = value => {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) throw new Error('Invalid u64 fee amount');
  return value;
};

export function validateFeePolicy(policy) {
  if (!policy || policy.version !== FEE_POLICY_VERSION || policy.tradingFeeBps !== TRADING_FEE_BPS || policy.treasury !== TREASURY_ADDRESS) {
    throw new Error('Unsupported or missing fee policy; this market requires an explicit rollout plan');
  }
}

export const tradingFee = gross => ceilDiv(checked(gross) * BigInt(TRADING_FEE_BPS), BPS);
export const grossForNet = net => checked(ceilDiv(checked(net) * BPS, BPS - BigInt(TRADING_FEE_BPS)));

// Buy input includes the fee. Sell output is the amount the wallet receives.
// grossSol = feeSol + netSol; only net buy / gross sell moves curve reserves.
/** @param {string} side @param {bigint} sol @param {bigint} tokens @param {bigint} input */
export function quoteWithFees(side, sol, tokens, input) {
  checked(input);
  if (side === 'buy') {
    const curve = quoteCurve(side, sol, tokens, input - tradingFee(input));
    const grossSol = curve.willGraduate ? grossForNet(curve.acceptedInput) : input;
    if (grossSol > input) throw new Error('Fee-inclusive buy exceeds input');
    return Object.freeze({ ...curve, acceptedInput: grossSol, grossSol,
      feeSol: grossSol - curve.acceptedInput, netSol: curve.acceptedInput });
  }
  const curve = quoteCurve(side, sol, tokens, input);
  const grossSol = curve.output, feeSol = tradingFee(grossSol), netSol = grossSol - feeSol;
  if (netSol === 0n) throw new Error('Amount produces no output after the trading fee');
  return Object.freeze({ ...curve, output: netSol, grossSol, feeSol, netSol });
}
