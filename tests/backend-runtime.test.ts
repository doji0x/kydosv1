import assert from 'node:assert/strict';
import { Connection, Keypair, TransactionMessage, VersionedTransaction, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { getTradeOrder, executeTrade, SOL, USDC } from '../base44/shared/jupiterTrading.js';
import { rpcCall, readEventWindow } from '../base44/shared/solanaIndex.js';
import { beforeDeadline } from '../base44/shared/astraDeadline.ts';

// No network/secret permissions. All fetches are in-process fixtures.
const owner = Keypair.fromSeed(new Uint8Array(32).fill(3));
const message = new TransactionMessage({ payerKey: owner.publicKey, recentBlockhash: PublicKey.default.toBase58(), instructions: [] });
function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
Deno.test('both legacy and v0 transaction messages expose the same checked fee payer', async () => {
  for (const compiled of [message.compileToLegacyMessage(), message.compileToV0Message()]) {
    const tx = new VersionedTransaction(compiled), requests: unknown[] = [];
    const original = globalThis.fetch;
    try {
      const params = { wallet: owner.publicKey.toBase58(), mint: USDC, side: 'buy', amount: '100', slippageBps: 100 };
      globalThis.fetch = async (_url, options) => {
        requests.push(options);
        return Response.json({ inputMint: SOL, outputMint: USDC, inAmount: '100', outAmount: '10', otherAmountThreshold: '9',
          swapMode: 'ExactIn', slippageBps: 100, transaction: base64(tx.serialize()), requestId: 'fixture' });
      };
      const order = await getTradeOrder(params, 'fixture-not-secret');
      assert.equal(order.transaction, base64(tx.serialize())); assert.equal(requests.length, 1);
      tx.sign([owner]);
      globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        assert.equal(body.requestId, 'fixture');
        return Response.json({ status: 'Success', signature: 'fixture-only' });
      };
      assert.equal((await executeTrade({ wallet: params.wallet, requestId: 'fixture', signedTransaction: base64(tx.serialize()) }, 'fixture-not-secret')).status, 'Success');
    } finally { globalThis.fetch = original; }
  }
});
Deno.test('wrong signer and unsigned execution remain rejected without broadcast', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('unexpected network'); };
  try {
    const tx = new VersionedTransaction(message.compileToV0Message());
    await assert.rejects(executeTrade({ wallet: owner.publicKey.toBase58(), requestId: 'x', signedTransaction: base64(tx.serialize()) }, 'fixture'), /must sign/);
    tx.sign([owner]);
    await assert.rejects(executeTrade({ wallet: PublicKey.default.toBase58(), requestId: 'x', signedTransaction: base64(tx.serialize()) }, 'fixture'), /must sign/);
  } finally { globalThis.fetch = original; }
});
Deno.test('named DAS params and positional Solana params survive RPC encoding unchanged', async () => {
  const original = globalThis.fetch;
  try {
    for (const params of [{ id: USDC, options: { showFungible: true } }, [USDC, { commitment: 'finalized' }]]) {
      globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(String(options?.body)); assert.deepEqual(body.params, params);
        return Response.json({ jsonrpc: '2.0', id: 'fixture', result: { ok: true } });
      };
      assert.deepEqual(await rpcCall('https://example.invalid', 'fixture', params), { ok: true });
    }
  } finally { globalThis.fetch = original; }
});
Deno.test('older and newer event windows retain their direction and disallow mixed cursors', async () => {
  const queries: { query: Record<string, unknown>; sort: string; limit: number }[] = [];
  const entity = { filter: async (query: Record<string, unknown>, sort: string, limit: number) => {
    queries.push({ query, sort, limit }); return [{ event_id: 'first', order_key: '2' }, { event_id: 'first', order_key: '2' }];
  } };
  const older = await readEventWindow(entity, {}, { before: '3', limit: 2 });
  assert.equal(older.events.length, 1); assert.equal(older.nextBefore, '2');
  await readEventWindow(entity, {}, { after: '1' });
  assert.deepEqual(queries, [{ query: { order_key: { $lt: '3' } }, sort: '-order_key', limit: 2 },
    { query: { order_key: { $gt: '1' } }, sort: 'order_key', limit: 200 }]);
  await assert.rejects(readEventWindow(entity, {}, { before: '3', after: '1' }), /older or a newer/);
});
Deno.test('Deno deadline result retains its explicit interface without type assertions', async () => {
  const result = await beforeDeadline(async () => ({ cursor: 'next', count: 2 }), Date.now() + 1000, 'timeout');
  const cursor: string = result.cursor; const count: number = result.count;
  assert.equal(cursor, 'next'); assert.equal(count, 2);
  // Connection is instantiated only to prove the pinned runtime SDK loads; no RPC.
  assert.equal(new Connection('http://127.0.0.1:1').rpcEndpoint, 'http://127.0.0.1:1');
});
