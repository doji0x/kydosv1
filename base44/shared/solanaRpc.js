const allowed = new Set([
  'getAccountInfo', 'getBalance', 'getBlockHeight', 'getBlockTime',
  'getGenesisHash', 'getLatestBlockhash', 'getFeeForMessage',
  'getMinimumBalanceForRentExemption', 'getSignatureStatuses',
  'getSignaturesForAddress', 'getTokenAccountBalance', 'getTransaction',
  'sendRawTransaction', 'sendTransaction', 'simulateTransaction', 'getProgramAccounts',
]);

export function buildSolanaRpcPayload(input) {
  const method = String(input?.method || '');
  if (!allowed.has(method)) throw new Error('RPC method not allowed');
  const id = input.id ?? 1;
  if (typeof id !== 'string' && !Number.isSafeInteger(id)) throw new Error('Invalid RPC request ID');
  const params = input.params ?? [];
  if (!Array.isArray(params) || params.length > 5) throw new Error('Invalid RPC parameters');
  // DBC fee UI may discover only DAMM positions for ONE explicit pool.
  // Do not expose an unrestricted program scan through the public RPC proxy.
  if (method === 'getProgramAccounts') {
    const [program, config] = params;
    const filters = config?.filters;
    const pool = filters?.[1]?.memcmp;
    const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every(key => keys.includes(key));
    if (params.length !== 2 || program !== 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG' ||
        !exactKeys(config, ['commitment', 'encoding', 'filters']) || config.commitment !== 'confirmed' ||
        config.encoding !== 'base64' || !Array.isArray(filters) || filters.length !== 2 ||
        !exactKeys(filters[0], ['dataSize']) || filters[0].dataSize !== 408 ||
        !exactKeys(filters[1], ['memcmp']) || !exactKeys(pool, ['offset', 'bytes', 'encoding']) ||
        pool.offset !== 8 || (pool.encoding !== undefined && pool.encoding !== 'base58') ||
        typeof pool.bytes !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool.bytes)) {
      throw new Error('Only pool-scoped DAMM position reads are permitted');
    }
  }
  const payload = JSON.stringify({ jsonrpc: '2.0', id,
    method: method === 'sendRawTransaction' ? 'sendTransaction' : method, params });
  if (payload.length > 25000) throw new Error('RPC request is too large');
  return payload;
}
