// Pure math, account decoding and instruction assembly. No chain writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'buffer';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { Keypair, SystemProgram } from '@solana/web3.js';
import idl from '../../src/lib/solana/idl/kydos_launchpad.json' with { type: 'json' };
import { CURVE_TOKENS, LIQUIDITY_TOKENS, INITIAL_VIRTUAL_SOL, INITIAL_VIRTUAL_TOKENS, COMPLETION_ESTIMATE } from '../../src/lib/solana/curveMath.js';
import { quoteWithFees, tradingFee, grossForNet, TREASURY_ADDRESS } from '../../src/lib/solana/fees.js';
import { quoteTrade } from '../../src/lib/solana/market.js';
import { buildCreateTransaction, buildTradeTransaction, decodeFeePolicy, deriveMarketAddresses, fetchMarket, FEE_POLICY_SPACE, PROGRAM_ID, TREASURY } from '../../src/lib/solana/client.js';

const policy = { version: 1, tradingFeeBps: 100, treasury: TREASURY_ADDRESS };
const market = (sol = 0n, tokens = CURVE_TOKENS) => ({
  decimals: 6, realSolReserve: sol, tokenReserve: tokens, graduationTarget: COMPLETION_ESTIMATE,
  virtualSolReserves: INITIAL_VIRTUAL_SOL, virtualTokenReserves: INITIAL_VIRTUAL_TOKENS,
  graduated: false, feePolicy: policy,
});

test('Rust/JS fee vectors agree on accepted input, reserve movement, treasury fees and wallet output', () => {
  const csv = readFileSync(new URL('./fixtures/fee-quotes.csv', import.meta.url), 'utf8');
  for (const line of csv.trim().split('\n').slice(1)) {
    const [side, ...values] = line.split(',');
    const [sol, tokens, input, gross, fee, net, output] = values.map(BigInt);
    const quote = quoteWithFees(side, sol, tokens, input);
    assert.equal(quote.grossSol, gross, line);
    assert.equal(quote.feeSol, fee, line);
    assert.equal(quote.netSol, net, line);
    assert.equal(quote.output, output, line);
    assert.equal(quote.acceptedInput, side === 'buy' ? gross : input);
    assert.equal(gross, fee + net);
    assert.equal(fee, tradingFee(gross));
    assert.ok(quote.acceptedInput <= input);
    const ui = quoteTrade(market(sol, tokens), side, input, 100);
    assert.equal(ui.output, output);
    assert.equal(ui.feeSol, fee);
    assert.equal(ui.minOut, (output * 9900n + 9999n) / 10000n, 'slippage applies to net seller output');
    const x = sol + INITIAL_VIRTUAL_SOL, y = tokens + INITIAL_VIRTUAL_TOKENS - CURVE_TOKENS;
    const nextX = side === 'buy' ? x + net : x - gross;
    const nextY = side === 'buy' ? y - output : y + input;
    assert.ok(nextX * nextY >= x * y, 'fees must not alter curve pricing');
  }
});

test('fee rounding has no zero-fee dust trades; completion charges the minimum gross', () => {
  for (let net = 1n; net <= 10_000n; net++) {
    const gross = grossForNet(net);
    assert.equal(gross - tradingFee(gross), net);
    assert.ok(gross - 1n - tradingFee(gross - 1n) < net);
  }
  const max = (1n << 64n) - 1n;
  assert.equal(tradingFee(max), 184_467_440_737_095_517n);
  assert.throws(() => grossForNet(max), /u64/);
  for (const input of [0n, 1n]) assert.throws(() => quoteWithFees('buy', 0n, CURVE_TOKENS, input), /positive/);
  assert.throws(() => quoteWithFees('sell', 1n, CURVE_TOKENS - 100_000n, 35_767n), /after the trading fee/);
  for (const amount of [-1n, 1n << 64n, 1, '1']) assert.throws(() => tradingFee(amount), /u64/);
  const final = quoteWithFees('buy', 0n, CURVE_TOKENS, max);
  assert.equal(final.netSol, COMPLETION_ESTIMATE);
  assert.equal(final.acceptedInput, 85_863_999_048n);
  assert.equal(final.output, CURVE_TOKENS);
  assert.equal(final.willGraduate, true);
  assert.equal(quoteWithFees('buy', 0n, CURVE_TOKENS, final.acceptedInput - 1n).willGraduate, false);
});

test('quotes reject missing, changed and unsupported policies', () => {
  for (const feePolicy of [undefined, { ...policy, version: 2 }, { ...policy, tradingFeeBps: 0 }, { ...policy, treasury: Keypair.generate().publicKey.toBase58() }]) {
    assert.throws(() => quoteTrade({ ...market(), feePolicy }, 'buy', 1_000_000_000n, 0), /fee policy/);
  }
});

test('create-and-buy and standalone trades bind the same policy PDA and fixed writable treasury', async () => {
  const wallet = { publicKey: Keypair.generate().publicKey }, connection = {};
  const built = await buildCreateTransaction({ wallet, connection, name: 'Kydos', symbol: 'KYDO', metadataUri: 'ipfs://example', initialBuyLamports: 1_000_000_000n });
  const { feePolicy } = deriveMarketAddresses(built.mint.publicKey);
  const create = built.transaction.instructions[1], buy = built.transaction.instructions[3];
  assert.equal(create.keys.find(k => k.pubkey.equals(feePolicy)).isWritable, true);
  for (const side of ['buy', 'sell']) {
    const tx = await buildTradeTransaction({ connection, wallet, mint: built.mint.publicKey, side, amount: 1_000_000n, minOut: 1n });
    const ix = tx.instructions.at(-1);
    for (const trade of [buy, ix]) {
      const recipient = trade.keys.find(k => k.pubkey.equals(TREASURY));
      assert.ok(recipient?.isWritable);
      assert.equal(recipient.isSigner, false);
      assert.equal(trade.keys.find(k => k.pubkey.equals(feePolicy)).isWritable, false);
    }
  }
  assert.equal(built.quote.grossSol, 1_000_000_000n);
  assert.equal(built.quote.feeSol, 10_000_000n);
  assert.equal(built.quote.netSol, 990_000_000n);
});

test('policy decoding and market reads reject substitution, foreign ownership and absent accounts', async () => {
  const mint = Keypair.generate().publicKey, addresses = deriveMarketAddresses(mint);
  const coder = new BorshAccountsCoder(idl), bn = n => new BN(n.toString());
  const state = { version: 1, bump: addresses.feePolicyBump, curve: addresses.curve, treasury: TREASURY, tradingFeeBps: 100 };
  const data = await coder.encode('feePolicy', state);
  assert.equal(data.length, FEE_POLICY_SPACE);
  assert.deepEqual(decodeFeePolicy(data, mint), policy);
  for (const changes of [{ curve: mint }, { bump: (state.bump + 1) % 256 }, { version: 2 }, { tradingFeeBps: 50 }, { treasury: mint }]) {
    const invalid = await coder.encode('feePolicy', { ...state, ...changes });
    assert.throws(() => decodeFeePolicy(invalid, mint));
  }
  assert.throws(() => decodeFeePolicy(data.subarray(0, 20), mint));
  const curveData = await coder.encode('curve', { creator: mint, mint, bump: addresses.bump, decimals: 6,
    name: 'Kydos', symbol: 'KYDO', metadataUri: 'ipfs://example', totalSupply: bn(CURVE_TOKENS + LIQUIDITY_TOKENS),
    curveTokenAllocation: bn(CURVE_TOKENS), liquidityTokenAllocation: bn(LIQUIDITY_TOKENS),
    virtualSolReserves: bn(INITIAL_VIRTUAL_SOL), virtualTokenReserves: bn(INITIAL_VIRTUAL_TOKENS),
    realTokenReserves: bn(CURVE_TOKENS), realSolReserves: bn(0), graduationTarget: bn(COMPLETION_ESTIMATE), graduated: false });
  const info = { owner: PROGRAM_ID, executable: false, data };
  const connection = {
    getAccountInfoAndContext: async key => {
      assert.ok(key.equals(addresses.curve));
      return { context: { slot: 1 }, value: { ...info, data: curveData } };
    },
    getAccountInfo: async key => { assert.ok(key.equals(addresses.feePolicy)); return info; },
  };
  assert.deepEqual((await fetchMarket(connection, mint)).feePolicy, policy);
  for (const invalid of [null, { ...info, owner: SystemProgram.programId }, { ...info, executable: true }, { ...info, data: Buffer.alloc(FEE_POLICY_SPACE) }]) {
    await assert.rejects(fetchMarket({ ...connection, getAccountInfo: async () => invalid }, mint));
  }
});
