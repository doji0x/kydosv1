// Raw units only: 6 token decimals, 9 SOL decimals. Mirrors launchpad/math.rs.
export const CURVE_TOKENS = 793_100_000_000_000n;
export const LIQUIDITY_TOKENS = 206_900_000_000_000n;
export const INITIAL_VIRTUAL_TOKENS = 1_073_000_000_000_000n;
export const INITIAL_VIRTUAL_SOL = 30_000_000_000n;
export const COMPLETION_ESTIMATE = 85_005_359_057n;
const U64_MAX = (1n << 64n) - 1n;
const checked = value => {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) throw new Error('Invalid u64 reserve or amount');
  return value;
};
const ceilDiv = (n, d) => n / d + (n % d === 0n ? 0n : 1n);

export function quoteCurve(side, sol, tokens, input) {
  checked(sol); checked(tokens); checked(input);
  if (!['buy', 'sell'].includes(side)) throw new Error('Choose buy or sell');
  if (input === 0n) throw new Error('Amount must be positive');
  if (tokens > CURVE_TOKENS) throw new Error('Invalid curve inventory');
  if (tokens === 0n) throw new Error('Curve complete; awaiting AMM migration');
  const x = checked(sol + INITIAL_VIRTUAL_SOL);
  const y = checked(tokens + INITIAL_VIRTUAL_TOKENS - CURVE_TOKENS);
  let acceptedInput = input, output;
  if (side === 'buy') {
    const finishCost = ceilDiv(x * tokens, y - tokens);
    if (input >= finishCost) {
      acceptedInput = checked(finishCost);
      output = tokens;
    } else {
      output = y * input / (x + input);
    }
    checked(sol + acceptedInput);
  } else {
    if (input > CURVE_TOKENS - tokens) throw new Error('Sell exceeds circulating curve inventory');
    output = x * input / (y + input);
    if (output > sol) throw new Error('Insufficient real SOL liquidity');
  }
  checked(output);
  if (output === 0n) throw new Error('Amount produces no output');
  return Object.freeze({ acceptedInput, output, willGraduate: side === 'buy' && output === tokens });
}
