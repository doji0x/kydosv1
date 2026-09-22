import test from 'node:test';
import assert from 'node:assert/strict';
import { Connection, Keypair } from '@solana/web3.js';
import { buildSolanaRpcPayload } from '../../base44/shared/solanaRpc.js';
import { createProxyFetch } from '../../src/lib/solana/rpc.js';
import { confirmTransactionHttp } from '../../src/lib/solana/transactions.js';
import { buildCreateTransaction, CURVE_SPACE, METADATA_SPACE } from '../../src/lib/solana/client.js';
import { estimateTransactionCosts } from '../../src/lib/solana/costs.js';

test('real web3 creation estimate traverses proxy policy with matching string IDs', async () => {
  const methods = [];
  const invoke = async (name, body) => {
    assert.equal(name, 'solanaRpc');
    const request = JSON.parse(buildSolanaRpcPayload(body));
    assert.equal(typeof request.id, 'string');
    methods.push(request.method);
    const result = {
      getLatestBlockhash: { context: { slot: 1 }, value: { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 } },
      getFeeForMessage: { context: { slot: 1 }, value: 10000 },
      getBalance: { context: { slot: 1 }, value: 1_000_000_000 },
      getMinimumBalanceForRentExemption: 100000,
    }[request.method];
    assert.notEqual(result, undefined);
    return { data: { jsonrpc: '2.0', id: request.id, result } };
  };
  const connection = new Connection('https://rpc.kydos.invalid', { fetch: createProxyFetch(invoke) });
  const wallet = { publicKey: Keypair.generate().publicKey };
  const { transaction, metadata } = await buildCreateTransaction({ connection, wallet,
    name: 'Test', symbol: 'T', metadataUri: 'https://example.com/token.json' });
  const costs = await estimateTransactionCosts({ connection, transaction, payer: wallet.publicKey,
    context: { ...metadata, curveSpace: CURVE_SPACE, metadataSpace: METADATA_SPACE } });
  assert.equal(costs.requiredLamports, 410000n);
  assert.equal(costs.sufficient, true);
  assert.deepEqual(methods, ['getLatestBlockhash', 'getFeeForMessage', 'getBalance',
    ...Array(4).fill('getMinimumBalanceForRentExemption')]);
});

test('proxy keeps method, request size and parameter restrictions', () => {
  assert.throws(() => buildSolanaRpcPayload({ method: 'requestAirdrop' }), /not allowed/);
  assert.throws(() => buildSolanaRpcPayload({ method: 'getBalance', params: Array(6).fill(0) }), /parameters/);
  assert.throws(() => buildSolanaRpcPayload({ method: 'getBalance', params: ['x'.repeat(25000)] }), /too large/);
  assert.throws(() => buildSolanaRpcPayload({ method: 'getBalance', id: {} }), /request ID/);
  assert.deepEqual(JSON.parse(buildSolanaRpcPayload({ method: 'sendRawTransaction', id: 'tx', params: ['wire'] })),
    { jsonrpc: '2.0', id: 'tx', method: 'sendTransaction', params: ['wire'] });
});

test('proxy preserves RPC errors and rejects mismatched responses', async () => {
  const options = { body: JSON.stringify({ id: 'fee', method: 'getFeeForMessage', params: [] }) };
  const error = { code: -32602, message: 'Invalid params' };
  const fetch = createProxyFetch(async () => ({ data: { jsonrpc: '2.0', id: 'fee', error } }));
  assert.deepEqual((await (await fetch('', options)).json()).error, error);
  for (const data of [{ jsonrpc: '2.0', id: 1, result: 0 }, { error: 'Unavailable' }]) {
    await assert.rejects(createProxyFetch(async () => ({ data }))('', options), /Invalid Solana RPC response/);
  }
});

test('HTTP confirmation waits for confirmed status and reports confirmed failures', async () => {
  for (const err of [null, { InstructionError: [0, 'InvalidArgument'] }]) {
    let count = 0;
    const connection = {
      getSignatureStatuses: async (signatures, options) => {
        assert.deepEqual(signatures, ['signature']);
        assert.equal(options.searchTransactionHistory, true);
        return { context: { slot: 2 }, value: [++count === 1 ? { confirmationStatus: 'processed', err } : { confirmationStatus: 'confirmed', err }] };
      },
      getBlockHeight: async () => 10,
    };
    const result = await confirmTransactionHttp(connection, { signature: 'signature', lastValidBlockHeight: 100 }, { pollIntervalMs: 0 });
    assert.deepEqual(result.value.err, err);
    assert.equal(count, 2);
  }
});

test('expiry and timeout remain ambiguous without any resubmission', async () => {
  for (const height of [10, 101]) {
    const connection = { getSignatureStatuses: async () => ({ value: [null] }), getBlockHeight: async () => height };
    await assert.rejects(confirmTransactionHttp(connection, { signature: 'signature', lastValidBlockHeight: 100 }, { timeoutMs: 0 }),
      error => error.state === 'unknown' && error.signature === 'signature');
  }
});
