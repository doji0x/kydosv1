import { VersionedTransaction } from '@solana/web3.js';
import { browserActivity } from '@/lib/solana/lifecycle';
import { encodeSignature, checkTransaction } from '@/lib/solana/transactions';
import { MAINNET_GENESIS, SWAP_SCOPE, tradingRequest } from '@/lib/jupiterTrade';

export default async function executeJupiterTrade({ order, wallet, mint, side, connection }) {
  const walletId = wallet.publicKey?.toBase58();
  if (order.taker !== walletId || !order.transaction || !order.requestId || Date.now() >= order.expiresAt) throw new Error('Quote expired or wallet changed. Refresh before signing.');
  if (await connection.getGenesisHash() !== MAINNET_GENESIS) throw new Error('Trading requires Solana mainnet.');
  const scope = { wallet: walletId, chain: MAINNET_GENESIS, program: SWAP_SCOPE, operation: side, conflict: SWAP_SCOPE };
  return browserActivity().execute(scope, { mint, requestId: order.requestId, inputMint: order.inputMint, outputMint: order.outputMint, amount: order.inAmount }, async save => {
    const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(order.transaction), char => char.charCodeAt(0)));
    if (Date.now() >= order.expiresAt) throw new Error('Quote expired. Please refresh.');
    save({ state: 'signing', message: 'Waiting for wallet approval.' });
    const signed = await wallet.signVersionedTransaction(tx);
    if (Date.now() >= order.expiresAt) throw new Error('Quote expired during wallet approval. Nothing was submitted; refresh and review again.');
    const signature = encodeSignature(signed.signatures[0]), bytes = signed.serialize();
    save({ state: 'signed', signature, lastValidBlockHeight: Number(order.lastValidBlockHeight) || undefined, message: 'Signed; not yet submitted.' });
    save({ state: 'submitting', message: 'Awaiting Jupiter execution and confirmation.' });
    const result = await tradingRequest({ action: 'execute', wallet: walletId, requestId: order.requestId, signedTransaction: btoa(String.fromCharCode(...bytes)) });
    if (result.signature && result.signature !== signature) throw new Error('Execution returned a different signature; check the original transaction.');
    if (result.status === 'Success' && result.signature === signature) {
      save({ state: 'confirmed', message: 'Swap confirmed on Solana mainnet.' });
      return { signature, ...result };
    }
    const observed = await checkTransaction(connection, signature);
    if (observed.state === 'confirmed') { save({ state: 'confirmed', message: observed.message }); return { signature, status: 'Success' }; }
    if (observed.state === 'failed') save({ state: 'failed', message: observed.message });
    throw new Error(result.error || observed.message || 'Confirmation unavailable. Check transaction status before trading again.');
  });
}