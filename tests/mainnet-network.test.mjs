import test from 'node:test';
import assert from 'node:assert/strict';
import { requireMainnetNetwork, identifySolanaNetwork, inspectLaunchNetwork } from '../base44/shared/solanaNetwork.js';
import { readNetwork } from '../base44/shared/solanaIndex.js';
import { relayMainnetRpc } from '../base44/shared/solanaRpcRelay.js';
const mainnet = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const devnet = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const endpoint = 'https://example.invalid/private-provider-token';
const request = { id: 42, method: 'sendTransaction', params: ['fixture-only-never-sent'] };
const response = (id, result) => Response.json({jsonrpc:'2.0', id, result});

test('mainnet-only guard preserves read-only historical network identities', () => {
  assert.equal(requireMainnetNetwork(mainnet).cluster, 'mainnet-beta');
  assert.equal(identifySolanaNetwork(devnet).cluster, 'devnet');
  for (const chain of [devnet, 'invalid', undefined, mainnet + 'x']) assert.throws(() => requireMainnetNetwork(chain), /require Solana mainnet/);
});
test('launch inspection rejects wrong network before reading accounts', async () => {
  let reads = 0;
  await assert.rejects(inspectLaunchNetwork({getGenesisHash: async () => devnet,
    getAccountInfo: async () => {reads++;}}, {}, {}), /mainnet/);
  assert.equal(reads, 0);
});
test('indexer network reader rejects a devnet identity without changing historical labels', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => response(1, devnet);
    await assert.rejects(readNetwork(endpoint), /require Solana mainnet/);
    globalThis.fetch = async () => response(1, mainnet);
    assert.equal((await readNetwork(endpoint)).cluster, 'mainnet-beta');
  } finally { globalThis.fetch = original; }
});
test('relay blocks signed submissions on non-mainnet before forwarding them', async () => {
  const calls = [];
  await assert.rejects(relayMainnetRpc(endpoint, request, async (_url, options) => {
    calls.push(JSON.parse(options.body).method); return response('kydos-network', devnet);
  }), /does not identify Solana mainnet/);
  assert.deepEqual(calls, ['getGenesisHash']);
});
test('relay forwards exactly once after checking mainnet and retains request identity', async () => {
  const calls = [];
  const data = await relayMainnetRpc(endpoint, request, async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    return response(body.id, body.method === 'getGenesisHash' ? mainnet : 'test-signature');
  });
  assert.equal(calls.length, 2); assert.equal(calls[1].method, 'sendTransaction');
  assert.deepEqual(calls[1].params, request.params);
  assert.deepEqual(data, {jsonrpc:'2.0', id:42, result:'test-signature'});
});
test('network-read requests are served by the guard without a second request', async () => {
  let calls = 0;
  const data = await relayMainnetRpc(endpoint, {id:'network',method:'getGenesisHash'}, async () => {
    calls++; return response('kydos-network', mainnet);
  });
  assert.equal(calls, 1); assert.equal(data.id, 'network'); assert.equal(data.result, mainnet);
});
test('unsupported methods and non-HTTPS endpoints perform no network access', async () => {
  let calls = 0; const fetch = async () => {calls++;};
  await assert.rejects(relayMainnetRpc(endpoint,{method:'requestAirdrop'},fetch), /not allowed/);
  await assert.rejects(relayMainnetRpc('http://example.invalid',request,fetch), /HTTPS/);
  assert.equal(calls,0);
});
test('transport ambiguity is sanitized and never retried', async () => {
  let calls = 0;
  await assert.rejects(relayMainnetRpc(endpoint,request,async (_url,options) => {
    calls++; if (calls === 1) return response(JSON.parse(options.body).id,mainnet);
    throw new Error(`request failed at ${endpoint}`);
  }), error => !error.message.includes('private-provider-token') && /Reconcile/.test(error.message));
  assert.equal(calls,2);
});
test('upstream RPC errors cannot expose provider messages or data', async () => {
  let calls = 0;
  const data = await relayMainnetRpc(endpoint,request,async () => ++calls === 1 ? response('kydos-network',mainnet) :
    Response.json({jsonrpc:'2.0',id:42,error:{code:-32002,message:endpoint,data:{secret:endpoint}}}));
  assert.equal(data.error.code,-32002); assert.equal('data' in data.error,false);
  assert.ok(!JSON.stringify(data).includes('private-provider-token'));
});
test('oversized or malformed network responses are rejected before forwarding', async () => {
  for (const result of [new Response('x'.repeat(2049)), response('wrong-id',mainnet), Response.json({oops:mainnet})]) {
    let calls=0;
    await assert.rejects(relayMainnetRpc(endpoint,request,async () => {calls++;return result;}));
    assert.equal(calls,1);
  }
});
test('HTTP rate-limit result stays retryable without forwarding the private URL', async () => {
  await assert.rejects(relayMainnetRpc(endpoint,request,async () => new Response(endpoint,{status:429})),
    error => error.status === 429 && !error.message.includes('private-provider-token'));
});
