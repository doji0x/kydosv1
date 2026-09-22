const allowed = new Set([
  'getAccountInfo', 'getBalance', 'getBlockHeight', 'getBlockTime',
  'getGenesisHash', 'getLatestBlockhash', 'getFeeForMessage',
  'getMinimumBalanceForRentExemption', 'getSignatureStatuses',
  'getSignaturesForAddress', 'getTokenAccountBalance', 'getTransaction',
  'sendRawTransaction', 'sendTransaction',
]);

export function buildSolanaRpcPayload(input) {
  const method = String(input?.method || '');
  if (!allowed.has(method)) throw new Error('RPC method not allowed');
  const id = input.id ?? 1;
  if (typeof id !== 'string' && !Number.isSafeInteger(id)) throw new Error('Invalid RPC request ID');
  const params = input.params ?? [];
  if (!Array.isArray(params) || params.length > 5) throw new Error('Invalid RPC parameters');
  const payload = JSON.stringify({ jsonrpc: '2.0', id,
    method: method === 'sendRawTransaction' ? 'sendTransaction' : method, params });
  if (payload.length > 25000) throw new Error('RPC request is too large');
  return payload;
}
