/** Server-only mainnet relay. No retries, fallback RPC, signing or URL logging. */
import { buildSolanaRpcPayload } from './solanaRpc.js';
import { requireMainnetNetwork } from './solanaNetwork.js';

export class RpcRelayError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
async function boundedJson(response, maximum) {
  if (!response.ok) throw new RpcRelayError('Mainnet RPC is temporarily unavailable', response.status === 429 ? 429 : 503);
  const declared = Number(response.headers.get('content-length'));
  if (declared > maximum) throw new RpcRelayError('RPC response exceeded the supported limit');
  const reader = response.body?.getReader();
  if (!reader) throw new RpcRelayError('RPC response was empty');
  let bytes = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new RpcRelayError('RPC response exceeded the supported limit'); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
/** All input is validated before network access. The endpoint is a server secret. */
export async function relayMainnetRpc(endpoint, input, fetchImpl = fetch) {
  let payload;
  try { payload = buildSolanaRpcPayload(input); }
  catch (error) { throw new RpcRelayError(error.message, error.message === 'RPC request is too large' ? 413 : 400); }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid endpoint');
  } catch { throw new RpcRelayError('Mainnet HTTPS RPC is not configured'); }
  const request = JSON.parse(payload);
  const call = async (body, maximum) => boundedJson(await fetchImpl(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body, signal: AbortSignal.timeout(15000), redirect: 'error',
  }), maximum);
  try {
    const genesis = await call(JSON.stringify({jsonrpc:'2.0', id:'kydos-network', method:'getGenesisHash', params:[]}), 2048);
    if (genesis?.jsonrpc !== '2.0' || genesis.id !== 'kydos-network' || genesis.error) throw new RpcRelayError('RPC network verification failed');
    try { requireMainnetNetwork(genesis.result); }
    catch { throw new RpcRelayError('The server RPC does not identify Solana mainnet'); }
    if (request.method === 'getGenesisHash') return { jsonrpc:'2.0', id:request.id, result:genesis.result };
    const data = await call(payload, 8 * 1024 * 1024);
    if (data?.jsonrpc !== '2.0' || data.id !== request.id || (!Object.hasOwn(data,'result') && !data.error)) {
      throw new RpcRelayError('RPC returned an invalid response');
    }
    // Never reflect credential-bearing upstream error messages or data to clients.
    if (data.error) return {jsonrpc:'2.0', id:request.id, error:{
      code:Number.isSafeInteger(data.error.code) ? data.error.code : -32000,
      message:'Mainnet RPC rejected the request. Reconcile submitted transactions before retrying.',
    }};
    return {jsonrpc:'2.0', id:request.id, result:data.result};
  } catch (error) {
    if (error instanceof RpcRelayError) throw error;
    throw new RpcRelayError('Mainnet RPC unavailable. Reconcile submitted transactions before retrying.');
  }
}
