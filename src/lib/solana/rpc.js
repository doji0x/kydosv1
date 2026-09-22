// web3.js uses string request IDs; preserve them through the authenticated proxy.
export function createProxyFetch(invoke) {
  return async (_url, options = {}) => {
    const request = JSON.parse(options.body || '{}');
    const response = await invoke('solanaRpc', {
      id: request.id, method: request.method, params: request.params || [],
    });
    const data = response.data;
    if (data?.jsonrpc !== '2.0' || data.id !== request.id) {
      throw new Error('Invalid Solana RPC response');
    }
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
}
