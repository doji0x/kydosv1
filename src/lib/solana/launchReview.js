import { Buffer } from 'buffer';
import { buildCreateTransaction, CURVE_SPACE, FEE_POLICY_SPACE, METADATA_SPACE, METADATA_PROGRAM_ID, PROGRAM_ID, sendTransaction } from './client.js';
import { estimateTransactionCosts } from './costs.js';
import { inspectLaunchNetwork } from '../../../base44/shared/solanaNetwork.js';
export { LAUNCH_NETWORKS } from './preflight.js';

export const getLaunchAvailability = connection => inspectLaunchNetwork(connection, PROGRAM_ID, METADATA_PROGRAM_ID);
export async function verifyLaunchNetwork(connection) {
  const { network, blockedReason } = await getLaunchAvailability(connection);
  if (blockedReason) throw new Error(blockedReason);
  // Executability does not verify the deployed binary against this source.
  return network;
}

export async function prepareLaunchReview(args) {
  const network = await verifyLaunchNetwork(args.connection);
  const built = await buildCreateTransaction(args);
  const costs = await estimateTransactionCosts({ connection: args.connection, transaction: built.transaction, payer: args.wallet.publicKey,
    context: { ...built.metadata, curveSpace: CURVE_SPACE, feePolicySpace: FEE_POLICY_SPACE, metadataSpace: METADATA_SPACE } });
  built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const review = {
    wallet: args.wallet.publicKey.toBase58(), mint: built.metadata.mint, network, costs, quote: built.quote,
    name: args.name, symbol: args.symbol, metadataUri: args.metadataUri,
    messageBase64: Buffer.from(built.transaction.serializeMessage()).toString('base64'),
  };
  return { built, review };
}

export async function submitReviewedLaunch({ connection, wallet, built, review, onStage = undefined, activity = undefined }) {
  if (!built || !review || wallet.publicKey?.toBase58() !== review.wallet || built.metadata.mint !== review.mint) {
    throw new Error('Wallet or launch changed. Review the launch again.');
  }
  if (Buffer.from(built.transaction.serializeMessage()).toString('base64') !== review.messageBase64) {
    throw new Error('Transaction changed. Review the launch again.');
  }
  const signature = await sendTransaction(connection, wallet, built.transaction, [built.mint], built.metadata, activity, {
    expectedChain: review.network.chain, maxCostLamports: review.costs.requiredLamports, onStage,
    beforeSign: async () => {
      const current = await verifyLaunchNetwork(connection);
      if (current.chain !== review.network.chain) throw new Error('Network changed. Review the launch again.');
    },
  });
  return { signature, mint: review.mint, network: review.network };
}

export const launchTransactionUrl = (signature, network) => `https://solscan.io/tx/${encodeURIComponent(signature)}${network.explorerQuery}`;
