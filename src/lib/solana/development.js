import { Connection } from '@solana/web3.js';
import { readSolanaDevelopmentConfig } from './config.js';

// This UI is local-development only. Reuse the existing configuration boundary;
// never silently send to a public cluster or display a private RPC URL.
export function developmentConnection() {
  const config = readSolanaDevelopmentConfig({
    cluster: 'localnet',
    rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL || 'http://127.0.0.1:8899',
  });
  return new Connection(config.rpcUrl, 'confirmed');
}
