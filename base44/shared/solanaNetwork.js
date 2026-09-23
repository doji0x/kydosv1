// Full genesis hashes, verified against the public mainnet/devnet RPCs.
export const SOLANA_NETWORKS = Object.freeze({
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d': { cluster: 'mainnet-beta', name: 'Solana mainnet', explorerQuery: '' },
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG': { cluster: 'devnet', name: 'Solana devnet', explorerQuery: '?cluster=devnet' },
});
export function identifySolanaNetwork(chain) {
  const network = SOLANA_NETWORKS[chain];
  if (!network) {
    const observed = typeof chain === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(chain) ? chain : 'an invalid genesis-hash response';
    throw new Error(`The configured RPC is not a supported Solana mainnet or devnet endpoint (reported ${observed}). Set HELIUS_RPC_URL to your Solana mainnet or devnet HTTP RPC. Changing Phantom's network does not change the app's server RPC.`);
  }
  return { chain, ...network };
}
export async function inspectLaunchNetwork(connection, programId, metadataProgramId) {
  const network = identifySolanaNetwork(await connection.getGenesisHash());
  const [program, metadata] = await Promise.all([connection.getAccountInfo(programId, 'confirmed'), connection.getAccountInfo(metadataProgramId, 'confirmed')]);
  const blockedReason = !program?.executable
    ? `Kydos program ${programId.toBase58()} is not deployed on ${network.name}. Deploy and verify this program, or ship the matching program ID and IDL for your deployment.`
    : !metadata?.executable ? `Token metadata program is unavailable on ${network.name}. Check HELIUS_RPC_URL.` : '';
  return { network, programDeployed: !!program?.executable, metadataDeployed: !!metadata?.executable, blockedReason };
}
