import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

/** The injected provider surface actually consumed by Kydos. */
export interface PhantomProvider {
  isPhantom: boolean;
  isConnected?: boolean;
  publicKey: PublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  on?(event: 'accountChanged', listener: (key: PublicKey | null) => void): void;
  on?(event: 'disconnect', listener: () => void): void;
  removeListener?(event: 'accountChanged', listener: (key: PublicKey | null) => void): void;
  removeListener?(event: 'disconnect', listener: () => void): void;
}
declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}
