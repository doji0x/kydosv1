export interface NetworkIdentity {
  chain: string;
  cluster: string;
  name: string;
  explorerQuery: string;
}
export interface AdminWalletStatus {
  wallet: string;
  network: NetworkIdentity;
  ready: boolean;
  blockedReason: string;
  balanceLamports: number;
  requiredLamports: number;
  programId?: string;
  programDeployed?: boolean;
}
export interface AdminLaunchReceipt {
  state: 'unknown' | 'submitted' | 'confirmed' | 'failed';
  requestId: string;
  wallet: string;
  network: NetworkIdentity;
  startedAt?: string;
  mint?: string;
  signature?: string;
  error?: string;
}
export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}
export interface CandlePage {
  network: 'solana-mainnet';
  mint: string;
  interval: string;
  currency: 'USD';
  volumeCurrency: 'USD';
  volumeAvailable?: boolean;
  pool: { address: string };
  before: number | null;
  fetchedAt: number;
  candles: CandleBar[];
  hasMore: boolean;
  nextBefore: number | null;
  stale?: boolean;
  warning?: string;
  retryAfter?: number;
}
