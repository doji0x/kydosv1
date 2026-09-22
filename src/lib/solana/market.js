// Owner-confirmed allocation: 79.31% curve, 20.69% liquidity, 30 virtual SOL.
// Quotes mirror lib.rs; deployment and graduation behavior need separate validation.
export const U64_MAX = (1n << 64n) - 1n;
import { INITIAL_VIRTUAL_SOL, INITIAL_VIRTUAL_TOKENS, COMPLETION_ESTIMATE } from './curveMath.js';
import { quoteWithFees, validateFeePolicy } from './fees.js';

export function rawAmount(value, label = 'Amount') {
  if (typeof value !== 'bigint' && !(typeof value === 'string' && /^\d+$/.test(value))) {
    throw new Error(`${label} must be an integer string or bigint`);
  }
  const amount = BigInt(value);
  if (amount < 0n || amount > U64_MAX) throw new Error(`${label} is outside u64 range`);
  return amount;
}

export function parseAmount(value, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) throw new Error('Invalid decimals');
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a decimal amount without exponents');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places`);
  return rawAmount(whole + fraction.padEnd(decimals, '0'));
}

export function formatAmount(value, decimals) {
  const text = rawAmount(value).toString().padStart(decimals + 1, '0');
  if (!decimals) return text;
  const fraction = text.slice(-decimals).replace(/0+$/, '');
  return text.slice(0, -decimals) + (fraction ? `.${fraction}` : '');
}

export function validateLaunch({ name, symbol, metadataUri }) {
  for (const [label, value, max] of [['Name', name, 32], ['Symbol', symbol, 10], ['Metadata URI', metadataUri, 200]]) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
    if (new TextEncoder().encode(value).length > max) throw new Error(`${label} exceeds ${max} UTF-8 bytes`);
  }
  let uri;
  try { uri = new URL(metadataUri); } catch { throw new Error('Use a hosted metadata URI'); }
  if (!['https:', 'ipfs:', 'ar:'].includes(uri.protocol) || uri.username || uri.password) {
    throw new Error('Use HTTPS, IPFS or Arweave metadata without credentials');
  }
}

export function quoteTrade(market, side, amount, slippageBps) {
  if (!['buy', 'sell'].includes(side)) throw new Error('Choose buy or sell');
  const input = rawAmount(amount);
  if (input === 0n) throw new Error('Amount must be positive');
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10000) {
    throw new Error('Slippage must be an integer from 0 to 9999 basis points');
  }
  if (market.decimals !== 6 || rawAmount(market.graduationTarget) !== COMPLETION_ESTIMATE ||
      rawAmount(market.virtualSolReserves) !== INITIAL_VIRTUAL_SOL ||
      rawAmount(market.virtualTokenReserves) !== INITIAL_VIRTUAL_TOKENS || typeof market.graduated !== 'boolean') {
    throw new Error('Unsupported curve configuration; legacy markets require an explicit migration plan');
  }
  if (market.graduated) throw new Error('Curve complete; awaiting AMM migration');
  validateFeePolicy(market.feePolicy);
  const quote = quoteWithFees(side,
    rawAmount(market.realSolReserve), rawAmount(market.tokenReserve), input);
  // Round the minimum UP: never allow more loss than the selected tolerance.
  const minOut = (quote.output * BigInt(10000 - slippageBps) + 9999n) / 10000n;
  return Object.freeze({ ...quote, side, input, minOut });
}

export function transactionError(error) {
  if (error?.signature) return `Transaction ${error.signature}: ${error.message}`;
  if (error?.code === 4001 || /reject/i.test(error?.message || '')) return 'Wallet request rejected. Nothing was submitted by this action.';
  const messages = ['Amount must be positive', 'Slippage exceeded; refresh the quote', 'Arithmetic overflow', 'Curve complete; awaiting AMM migration', 'Insufficient liquidity', 'Name too long', 'Symbol too long', 'Metadata URI too long', 'Unsupported curve configuration', 'Invalid or unsupported fee policy'];
  const match = /custom program error: 0x([0-9a-f]+)/i.exec(error?.message || '');
  const code = error?.error?.errorCode?.number ?? (match ? parseInt(match[1], 16) : undefined);
  return messages[code - 6000] || error?.message || 'Transaction failed';
}
