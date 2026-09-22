// Read-only. Never prints the endpoint/key or submits a transaction.
import { Connection, PublicKey } from '@solana/web3.js';
import { inspectLaunchNetwork } from '../../base44/shared/solanaNetwork.js';
import { PROGRAM_ADDRESS } from '../../base44/shared/solanaProtocol.js';
const endpoint = process.env.HELIUS_RPC_URL;
if (!endpoint) throw new Error('HELIUS_RPC_URL is required');
try {
  const status = await inspectLaunchNetwork(new Connection(endpoint.trim(), 'confirmed'), new PublicKey(PROGRAM_ADDRESS), new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'));
  console.log(JSON.stringify({ programId: PROGRAM_ADDRESS, ...status, binaryVerified: false }, null, 2));
  if (status.blockedReason) process.exitCode = 1;
} catch (error) { console.error(String(error.message).replace(/https?:\/\/\S+/g, '[RPC endpoint]')); process.exitCode = 1; }
