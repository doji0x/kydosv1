/**
 * Pure, local-development configuration boundary; performs no RPC or wallet I/O.
 * Accept only public configuration explicitly supplied by the caller.
 * This is not a cluster identity check or a production RPC configuration API.
 * @param {{ cluster: string, rpcUrl: string }} input
 * @returns {Readonly<{ cluster: 'localnet', rpcUrl: string }>}
 */
export function readSolanaDevelopmentConfig(input) {
  if (!input || input.cluster !== 'localnet') {
    throw new Error('Solana scaffold supports localnet configuration only');
  }
  if (typeof input.rpcUrl !== 'string' || !input.rpcUrl.trim()) {
    throw new Error('An explicit local RPC URL is required');
  }

  let endpoint;
  try {
    endpoint = new URL(input.rpcUrl);
  } catch {
    throw new Error('Invalid local RPC URL');
  }

  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    endpoint.pathname !== '/'
  ) {
    // Do not include supplied values in errors: URLs may contain credentials.
    throw new Error('Use a loopback HTTP(S) RPC URL without credentials, path, query or fragment');
  }

  return Object.freeze({ cluster: 'localnet', rpcUrl: endpoint.href });
}
