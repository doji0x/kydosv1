import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteTrade } from '../../src/lib/solana/market.js';
import { quoteCurve, CURVE_TOKENS, LIQUIDITY_TOKENS, INITIAL_VIRTUAL_TOKENS, INITIAL_VIRTUAL_SOL, COMPLETION_ESTIMATE } from '../../src/lib/solana/curveMath.js';
const market = (sol = 0n, tokens = CURVE_TOKENS, graduated = false) => ({
  realSolReserve: sol, tokenReserve: tokens, decimals: 6, graduationTarget: COMPLETION_ESTIMATE,
  virtualTokenReserves: INITIAL_VIRTUAL_TOKENS, virtualSolReserves: INITIAL_VIRTUAL_SOL, graduated,
});

test('pricing configuration matches Rust; approved allocations and virtual SOL are preserved', () => {
  const rust = readFileSync(new URL('../programs/kydos_launchpad/src/lib.rs', import.meta.url), 'utf8');
  const constant = name => {
    const expression = rust.match(new RegExp(`pub const ${name}: u(?:8|64) = ([^;]+);`))[1].replaceAll('_', '');
    return expression.split('*').map(p => p.trim() === 'SCALE' ? 1_000_000n : BigInt(p.trim())).reduce((a, b) => a * b);
  };
  for (const [name, value] of Object.entries({ DECIMALS: 6n, TOTAL_SUPPLY: CURVE_TOKENS + LIQUIDITY_TOKENS,
    CURVE_TOKEN_ALLOCATION: CURVE_TOKENS, LIQUIDITY_TOKEN_ALLOCATION: LIQUIDITY_TOKENS,
    VIRTUAL_TOKEN_RESERVES: INITIAL_VIRTUAL_TOKENS, VIRTUAL_SOL_RESERVES: INITIAL_VIRTUAL_SOL,
    GRADUATION_TARGET: COMPLETION_ESTIMATE })) assert.equal(constant(name), value, name);
});

test('shared Rust/JS vectors cover ordinary trades and final partial fills', () => {
  const csv = readFileSync(new URL('./fixtures/curve-quotes.csv', import.meta.url), 'utf8');
  for (const line of csv.trim().split('\n').slice(1)) {
    const [side, ...values] = line.split(',');
    const [sol, tokens, input, accepted, output] = values.map(BigInt);
    const q = quoteCurve(side, sol, tokens, input);
    assert.equal(q.acceptedInput, accepted, line);
    assert.equal(q.output, output, line);
    const x = sol + INITIAL_VIRTUAL_SOL, y = tokens + INITIAL_VIRTUAL_TOKENS - CURVE_TOKENS;
    const nextX = side === 'buy' ? x + accepted : x - output;
    const nextY = side === 'buy' ? y - output : y + input;
    assert.ok(nextX * nextY >= x * y, 'rounding must preserve constant product');
    const ui = quoteTrade(market(sol, tokens), side, input, 100);
    assert.equal(ui.output, output);
    assert.equal(ui.minOut, (output * 9900n + 9999n) / 10000n);
  }
});

test('85 SOL never triggers an inventory giveaway; completion follows inventory exhaustion', () => {
  const q = quoteCurve('buy', 0n, CURVE_TOKENS, 85_000_000_000n);
  assert.equal(q.willGraduate, false);
  assert.ok(q.output < CURVE_TOKENS);
  const finish = quoteCurve('buy', q.acceptedInput, CURVE_TOKENS - q.output, 10_000_000n);
  assert.equal(finish.willGraduate, true);
  assert.ok(finish.acceptedInput < 10_000_000n);
  const full = quoteCurve('buy', 0n, CURVE_TOKENS, 100_000_000_000n);
  assert.equal(full.acceptedInput, COMPLETION_ESTIMATE);
  assert.equal(full.output, CURVE_TOKENS);
});

test('sequential buys and sells preserve reserves and cannot profit from rounding', () => {
  let sol = 0n, tokens = CURVE_TOKENS;
  for (let i = 1n; i <= 150n; i++) {
    const input = i * 100_003n;
    const buy = quoteCurve('buy', sol, tokens, input);
    const sell = quoteCurve('sell', sol + buy.acceptedInput, tokens - buy.output, buy.output);
    assert.ok(sell.output <= buy.acceptedInput);
    sol += buy.acceptedInput - sell.output;
    assert.equal(tokens, CURVE_TOKENS);
  }
});

test('complete and legacy curves fail closed; reserves and amounts stay within bounds', () => {
  for (const side of ['buy', 'sell']) {
    assert.throws(() => quoteTrade(market(COMPLETION_ESTIMATE, 0n, true), side, 1n, 0), /awaiting AMM migration/);
    assert.throws(() => quoteCurve(side, 0n, CURVE_TOKENS, 0n));
  }
  assert.throws(() => quoteTrade({ ...market(), virtualTokenReserves: CURVE_TOKENS }, 'buy', 1n, 0), /legacy/);
  assert.throws(() => quoteCurve('buy', (1n << 64n) - 1n, CURVE_TOKENS, 1n));
  assert.throws(() => quoteCurve('buy', 0n, CURVE_TOKENS + 1n, 1n));
  assert.throws(() => quoteCurve('sell', 0n, CURVE_TOKENS, 1n));
  assert.throws(() => quoteCurve('sell', 1_000_000_000n, 758_487_096_774_194n, 1000n), /no output/);
});
