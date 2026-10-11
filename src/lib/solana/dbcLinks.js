import { PublicKey } from '@solana/web3.js';
import { identifySolanaNetwork } from '../../../base44/shared/solanaNetwork.js';
export { identifySolanaNetwork as dbcNetwork } from '../../../base44/shared/solanaNetwork.js';

export function dbcExplorerUrl(kind, value, chain) {
  if (!['tx', 'token', 'account'].includes(kind)) throw new Error('Invalid explorer target');
  const network = identifySolanaNetwork(chain);
  if (kind === 'tx') {
    if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value)) throw new Error('Invalid transaction signature');
  } else value = new PublicKey(value).toBase58();
  return `https://solscan.io/${kind}/${encodeURIComponent(value)}${network.explorerQuery}`;
}
export function dbcLaunchUrl(mint, chain) {
  return `/launch?dbcMint=${new PublicKey(mint).toBase58()}&network=${identifySolanaNetwork(chain).cluster}`;
}
