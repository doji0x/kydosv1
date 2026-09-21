import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'buffer';
import { Keypair } from '@solana/web3.js';
import { ACCOUNT_SIZE, MINT_SIZE, TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { estimateTransactionCosts } from '../../src/lib/solana/costs.js';
import { buildCreateTransaction, buildTradeTransaction, CURVE_SPACE, estimateCreateCosts, estimateTradeCosts, sendTransaction } from '../../src/lib/solana/client.js';
import { quoteTrade } from '../../src/lib/solana/market.js';
import { encodeSignature } from '../../src/lib/solana/transactions.js';

const payer = Keypair.generate(), mint = Keypair.generate().publicKey;
const wallet = { publicKey: payer.publicKey };
const launch = { wallet, name: 'Test', symbol: 'T', metadataUri: 'https://example.com/token.json' };
const tradeArgs = { wallet, mint, side: 'buy', amount: 100n, minOut: 1n };
const rentFor = size => size * 10;
const createRequired = 10000 + rentFor(MINT_SIZE) + rentFor(CURVE_SPACE) + rentFor(ACCOUNT_SIZE);

function tokenInfo(tokens = 100n) {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  mint.toBuffer().copy(data, 0);
  payer.publicKey.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(tokens, 64);
  data[108] = 1; // SPL AccountState.Initialized
  return { data, owner: TOKEN_PROGRAM_ID, executable: false, lamports: 1650 };
}

function rpc(overrides = {}) {
  const calls = { fees: [], rents: [], balances: [], accounts: [], blockhashes: 0, broadcasts: 0 };
  const connection = {
    rpcEndpoint: 'http://127.0.0.1:8899',
    getGenesisHash: async () => 'local-test-chain',
    getLatestBlockhash: async commitment => {
      assert.equal(commitment, 'confirmed'); calls.blockhashes++;
      return { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 };
    },
    getFeeForMessage: async (message, commitment) => {
      assert.equal(commitment, 'confirmed'); calls.fees.push(message);
      return { value: message.header.numRequiredSignatures * 5000 };
    },
    getBalance: async (owner, commitment) => {
      assert.ok(owner.equals(payer.publicKey)); assert.equal(commitment, 'confirmed'); calls.balances.push(owner);
      return 1000000;
    },
    getMinimumBalanceForRentExemption: async (size, commitment) => {
      assert.equal(commitment, 'confirmed'); calls.rents.push(size); return rentFor(size);
    },
    getAccountInfo: async (address, commitment) => {
      assert.equal(commitment, 'confirmed');
      assert.ok(address.equals(await getAssociatedTokenAddress(mint, payer.publicKey)));
      calls.accounts.push(address); return tokenInfo();
    },
    sendRawTransaction: async () => { calls.broadcasts++; throw new Error('Unexpected broadcast'); },
    ...overrides,
  };
  return { connection, calls };
}

const activity = { execute: async (_scope, _metadata, run) => run(() => {}) };

test('create estimates actual two-signature message and mint, curve, vault rent', async () => {
  const { connection, calls } = rpc({ getBalance: async () => createRequired });
  const result = await estimateCreateCosts({ ...launch, connection });
  assert.deepEqual(result, { inputLamports: 0n, networkFeeLamports: 10000n,
    rentLamports: BigInt(createRequired - 10000), requiredLamports: BigInt(createRequired),
    balanceLamports: BigInt(createRequired), shortfallLamports: 0n, sufficient: true });
  assert.deepEqual(calls.rents, [MINT_SIZE, CURVE_SPACE, ACCOUNT_SIZE]);
  assert.equal(calls.fees[0].header.numRequiredSignatures, 2);
  assert.ok(calls.fees[0].accountKeys[0].equals(payer.publicKey));
  assert.equal(calls.blockhashes, 1);
  assert.equal(calls.accounts.length, 0);
});

test('buy uses full authorized input, existing ATA has no rent, missing ATA adds ACCOUNT_SIZE rent', async () => {
  const quote = quoteTrade({ realSolReserve: 84999999999n, tokenReserve: 300000000000000n,
    decimals: 6, graduationTarget: 85000000000n, graduated: false }, 'buy', 100n, 0);
  assert.equal(quote.acceptedInput, 1n);
  for (const missing of [false, true]) {
    const { connection, calls } = rpc(missing ? { getAccountInfo: async () => null } : {});
    const result = await estimateTradeCosts({ ...tradeArgs, amount: quote.input, minOut: quote.minOut, connection });
    assert.equal(result.inputLamports, 100n);
    assert.equal(result.networkFeeLamports, 5000n);
    assert.equal(result.rentLamports, missing ? BigInt(rentFor(ACCOUNT_SIZE)) : 0n);
    assert.equal(result.requiredLamports, 5100n + result.rentLamports);
    assert.deepEqual(calls.rents, missing ? [ACCOUNT_SIZE] : []);
  }
});

test('sell requires valid existing ATA and enough tokens; proceeds never pay upfront fees', async () => {
  const args = { ...tradeArgs, side: 'sell', minOut: 100000n };
  const tx = await buildTradeTransaction(args);
  assert.equal(tx.instructions.length, 1, 'sell must not create an empty ATA');
  for (const [info, error] of [[null, /existing/], [tokenInfo(99n), /Insufficient sell tokens/]]) {
    const { connection } = rpc({ getAccountInfo: async () => info });
    await assert.rejects(estimateTradeCosts({ ...args, connection }), error);
  }
  const { connection } = rpc({ getBalance: async () => 4999 });
  const result = await estimateTradeCosts({ ...args, connection });
  assert.equal(result.inputLamports, 0n); assert.equal(result.rentLamports, 0n);
  assert.equal(result.requiredLamports, 5000n); assert.equal(result.shortfallLamports, 1n);
  assert.equal(result.sufficient, false);
});

test('invalid wallet token accounts fail closed for both sides', async () => {
  const invalid = [
    () => ({ ...tokenInfo(), owner: payer.publicKey }),
    () => ({ ...tokenInfo(), executable: true }),
    () => { const info = tokenInfo(); info.data[108] = 2; return info; },
    () => { const info = tokenInfo(); info.data[108] = 0; return info; },
    () => { const info = tokenInfo(); mint.toBuffer().copy(info.data, 32); return info; },
    () => { const info = tokenInfo(); payer.publicKey.toBuffer().copy(info.data, 0); return info; },
    () => ({ ...tokenInfo(), data: Buffer.alloc(1) }),
  ];
  for (const side of ['buy', 'sell']) for (const make of invalid) {
    const { connection } = rpc({ getAccountInfo: async () => make() });
    await assert.rejects(estimateTradeCosts({ ...tradeArgs, side, connection }));
  }
});

test('null fees, invalid numeric RPC values and RPC failures never produce estimates', async () => {
  for (const value of [null, undefined, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '5000']) {
    for (const method of ['getFeeForMessage', 'getBalance', 'getMinimumBalanceForRentExemption']) {
      const { connection } = rpc({ [method]: async () => method === 'getFeeForMessage' ? { value } : value });
      await assert.rejects(estimateCreateCosts({ ...launch, connection }), /safe integer/);
    }
  }
  for (const method of ['getLatestBlockhash', 'getFeeForMessage', 'getBalance', 'getMinimumBalanceForRentExemption', 'getAccountInfo']) {
    const { connection } = rpc({ [method]: async () => { throw new Error('RPC offline'); } });
    await assert.rejects(estimateTradeCosts({ ...tradeArgs, connection: {
      ...connection, ...(method === 'getMinimumBalanceForRentExemption' ? { getAccountInfo: async () => null } : {}),
    } }), /RPC offline/);
  }
});

test('submission checks refreshed actual transaction before signer/broadcast; exact balance succeeds', async () => {
  const built = buildCreateTransaction(launch);
  let signed = 0, feeMessage;
  const { connection, calls } = rpc({
    getBalance: async () => createRequired,
    getFeeForMessage: async message => { feeMessage = Buffer.from(message.serialize()); return { value: 10000 }; },
    sendRawTransaction: async wire => { calls.broadcasts++; assert.ok(wire.length > 0); return encodeSignature(built.transaction.signature); },
    confirmTransaction: async () => ({ value: { err: null } }),
  });
  await sendTransaction(connection, { ...wallet, signTransaction: async tx => {
    signed++; assert.deepEqual(Buffer.from(tx.serializeMessage()), feeMessage);
    assert.ok(tx.signatures.find(s => s.publicKey.equals(built.mint.publicKey)).signature, 'mint partial signature preserved');
    tx.partialSign(payer); return tx;
  } }, built.transaction, [built.mint], built.metadata, activity);
  assert.equal(signed, 1); assert.equal(calls.broadcasts, 1); assert.equal(calls.blockhashes, 1);
});

test('failed submission costs never invoke signer or broadcast, including absent context', async () => {
  const cases = [
    { getBalance: async () => createRequired - 1 },
    { getFeeForMessage: async () => ({ value: null }) },
    { getBalance: async () => Number.MAX_SAFE_INTEGER + 1 },
    { getMinimumBalanceForRentExemption: async () => { throw new Error('RPC offline'); } },
  ];
  for (const overrides of cases) {
    const built = buildCreateTransaction(launch), { connection, calls } = rpc(overrides);
    let signed = 0;
    await assert.rejects(sendTransaction(connection, { ...wallet, signTransaction: async () => { signed++; } },
      built.transaction, [built.mint], built.metadata, activity));
    assert.equal(signed, 0); assert.equal(calls.broadcasts, 0);
  }
  for (const context of [undefined, { operation: 'unknown', mint: mint.toBase58() }, { operation: 'buy', mint: mint.toBase58() }]) {
    const { connection, calls } = rpc(); let signed = 0;
    await assert.rejects(sendTransaction(connection, { ...wallet, signTransaction: async () => { signed++; } },
      await buildTradeTransaction(tradeArgs), [], context, activity));
    assert.equal(signed, 0); assert.equal(calls.broadcasts, 0);
  }
  for (const info of [null, tokenInfo(99n)]) {
    const { connection, calls } = rpc({ getAccountInfo: async () => info }); let signed = 0;
    await assert.rejects(sendTransaction(connection, { ...wallet, signTransaction: async () => { signed++; } },
      await buildTradeTransaction({ ...tradeArgs, side: 'sell' }), [],
      { operation: 'sell', mint: mint.toBase58(), amount: '100', minOut: '1' }, activity));
    assert.equal(signed, 0); assert.equal(calls.broadcasts, 0);
  }
});

test('preview success does not authorize submission after balance or ATA changes', async () => {
  const { connection, calls } = rpc();
  assert.equal((await estimateTradeCosts({ ...tradeArgs, connection })).sufficient, true);
  connection.getBalance = async () => 5099;
  let signed = 0;
  await assert.rejects(sendTransaction(connection, { ...wallet, signTransaction: async () => { signed++; } },
    await buildTradeTransaction(tradeArgs), [], { operation: 'buy', mint: mint.toBase58(), amount: '100', minOut: '1' }, activity), /short 1 lamports/);
  assert.equal(signed, 0); assert.equal(calls.broadcasts, 0);
  assert.equal(calls.blockhashes, 2);
  assert.notEqual(calls.fees[0].recentBlockhash, calls.fees[1].recentBlockhash);
});

test('estimator itself rejects absent context', async () => {
  const { connection } = rpc();
  await assert.rejects(estimateTransactionCosts({ connection, transaction: await buildTradeTransaction(tradeArgs), payer: payer.publicKey }), /context required/);
});

// Exercise the small page effect directly with deferred RPC promises. This uses
// the checked-in effect body (not a duplicate model) without a JSX/DOM test stack.
for (const page of ['SolanaLaunch', 'SolanaMarket']) test(`${page}: input keys invalidate immediately and cleanup ignores late results`, async () => {
  const source = await readFile(new URL(`../../src/pages/${page}.jsx`, import.meta.url), 'utf8');
  const body = source.match(/useEffect\(\(\) => \{\n    let cancelled = false;([\s\S]*?)\n  \}, \[estimateKey,/);
  assert.ok(body, 'cancellable estimate effect exists');
  assert.match(source, /estimate\?\.key === estimateKey \? estimate : null/);
  assert.match(source, /disabled=\{[^\n]*!costs\?\.sufficient/);
  const keyLine = source.match(/const estimateKey = JSON.stringify\(([^\n]+)\);/)[1];
  for (const field of page === 'SolanaLaunch' ? ['walletId', 'wallet.connected', 'form.name', 'form.symbol', 'form.metadataUri'] : ['walletId', 'wallet.connected', 'mint', 'side', 'amount', 'bps', 'quote?.minOut']) assert.ok(keyLine.includes(field), field);
  const run = new Function('setEstimate', 'valid', 'validEstimate', 'busy', 'estimateCreateCosts', 'estimateTradeCosts', 'rpc', 'wallet', 'form', 'mint', 'side', 'quote', 'estimateKey', 'transactionError', `let cancelled = false;${body[1]}`);
  const pending = []; let state;
  const estimate = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const start = key => run(value => { state = value; }, true, true, false, estimate, estimate, { connection: {} }, wallet, launch, mint, 'buy', { input: 1n, minOut: 1n }, key, e => e.message);
  const cleanup = start('old'); assert.equal(state, null);
  cleanup(); const cleanupNew = start('new');
  pending[1].resolve({ sufficient: true }); await Promise.resolve();
  assert.equal(state.key, 'new');
  pending[0].resolve({ sufficient: false }); await Promise.resolve();
  assert.equal(state.key, 'new', 'late old success ignored');
  cleanupNew(); const cleanupFailed = start('failed'); cleanupFailed(); start('latest');
  pending[2].reject(new Error('old RPC error')); await Promise.resolve();
  assert.equal(state, null, 'late old error ignored');
  pending[3].resolve({ sufficient: true }); await Promise.resolve();
  assert.equal(state.key, 'latest');
});
