import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteTrade } from '../../src/lib/solana/market.js';

const SCALE = 1_000_000n;
const CURVE = 793_100_000n * SCALE;
const LP = 206_900_000n * SCALE;
const VIRTUAL_SOL = 30_000_000_000n;
const TARGET = 85_000_000_000n;
const market = (sol = 0n, tokens = CURVE, graduated = false) => ({
  realSolReserve: sol, tokenReserve: tokens, decimals: 6, graduationTarget: TARGET, graduated,
});

test('program constants retain the owner-confirmed creation configuration', () => {
  const rust = readFileSync(new URL('../programs/kydos_launchpad/src/lib.rs', import.meta.url), 'utf8');
  const constant = name => {
    const expression = rust.match(new RegExp(`pub const ${name}: u(?:8|64) = ([^;]+);`))[1].replaceAll('_', '');
    return expression.split('*').map(part => part.trim() === 'SCALE' ? SCALE : BigInt(part.trim())).reduce((a, b) => a * b);
  };
  assert.equal(constant('DECIMALS'), 6n);
  assert.equal(constant('SCALE'), SCALE);
  assert.equal(constant('TOTAL_SUPPLY'), CURVE + LP);
  assert.equal(constant('CURVE_TOKEN_ALLOCATION'), CURVE);
  assert.equal(constant('LIQUIDITY_TOKEN_ALLOCATION'), LP);
  assert.equal(constant('VIRTUAL_SOL_RESERVES'), VIRTUAL_SOL);
  assert.equal(constant('GRADUATION_TARGET'), TARGET);
});

test('buy quote includes liquidity tokens in effective reserves, matching the program', () => {
  const solIn = 1_000_000_000n;
  const expected = CURVE + LP - VIRTUAL_SOL * (CURVE + LP) / (VIRTUAL_SOL + solIn);
  const quote = quoteTrade(market(), 'buy', solIn, 100);
  assert.equal(quote.output, expected);
  assert.equal(quote.minOut, (expected * 9900n + 9999n) / 10000n);
});

test('sell quote uses real curve inventory plus liquidity allocation', () => {
  const sol = 5_000_000_000n, tokens = 700_000_000n * SCALE, input = 1000n * SCALE;
  const x = sol + VIRTUAL_SOL;
  const expected = x - x * (tokens + LP) / (tokens + LP + input);
  assert.equal(quoteTrade(market(sol, tokens), 'sell', input, 0).output, expected);
});

test('threshold buy caps SOL input and returns remaining curve inventory', () => {
  const remaining = 55_000_000n * SCALE;
  const quote = quoteTrade(market(TARGET - 1n, remaining), 'buy', 100n, 0);
  assert.equal(quote.acceptedInput, 1n);
  assert.equal(quote.output, remaining);
  assert.equal(quote.willGraduate, true);
});

test('post-graduation quote does not sell reserved liquidity inventory', () => {
  assert.throws(() => quoteTrade(market(TARGET, 0n, true), 'buy', 1_000_000_000n, 0), /no output/);
  const quote = quoteTrade(market(TARGET, 1n, true), 'buy', 1_000_000_000n, 0);
  assert.equal(quote.output, 1n);
});
