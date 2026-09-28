import { PublicKey, VersionedTransaction } from 'npm:@solana/web3.js@1.98.4';

export const SOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function address(value) {
  if (typeof value !== 'string' || value.length > 44) throw invalid('Invalid wallet or token address.');
  try { return new PublicKey(value).toBase58(); } catch { throw invalid('Invalid wallet or token address.'); }
}
export function tradeInput(input) {
  const mint = address(input.mint), wallet = address(input.wallet), counter = mint === SOL ? USDC : SOL;
  if (!['buy', 'sell'].includes(input.side)) throw invalid('Choose buy or sell.');
  if (typeof input.amount !== 'string' || !/^[1-9]\d{0,19}$/.test(input.amount) || BigInt(input.amount) > 18446744073709551615n) throw invalid('Enter a positive amount within the token limit.');
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 1 || input.slippageBps > 500) throw invalid('Slippage must be between 0.01% and 5%.');
  return { inputMint: input.side === 'buy' ? counter : mint, outputMint: input.side === 'buy' ? mint : counter, amount: input.amount, taker: wallet, slippageBps: input.slippageBps };
}
async function jupiter(path, apiKey, options = {}) {
  if (!apiKey) throw invalid('Jupiter trading is not configured.', 503);
  const response = await fetch(`https://api.jup.ag/swap/v2/${path}`, { ...options, headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'manual' });
  const data = await response.json();
  if (!response.ok) throw invalid(response.status === 429 ? 'Trading is busy. Wait a moment and refresh.' : String(data.errorMessage || data.error || 'Jupiter could not process this trade.').slice(0, 240), response.status === 429 ? 429 : 502);
  return data;
}
export async function getTradeOrder(input, apiKey) {
  const params = tradeInput(input);
  // Wallet-funded aggregator routes keep the transaction signature recoverable before broadcast.
  const data = await jupiter(`order?${new URLSearchParams({ ...params, swapMode: 'ExactIn', excludeRouters: 'jupiterz', priorityFeeLamports: '100000', broadcastFeeType: 'maxCap' })}`, apiKey);
  if (data.inputMint !== params.inputMint || data.outputMint !== params.outputMint || data.inAmount !== params.amount || data.swapMode !== 'ExactIn' || data.slippageBps !== params.slippageBps) throw invalid('Jupiter returned a mismatched quote. Refresh and try again.', 502);
  if (!/^\d+$/.test(data.outAmount) || BigInt(data.outAmount) <= 0n || !/^\d+$/.test(data.otherAmountThreshold) || BigInt(data.otherAmountThreshold) <= 0n || BigInt(data.otherAmountThreshold) > BigInt(data.outAmount)) throw invalid('No usable liquidity route is available for this amount.', 422);
  let transaction = data.transaction || null, unavailable = data.errorMessage || data.error || null;
  if (transaction) {
    const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(transaction), c => c.charCodeAt(0)));
    const keys = tx.message.staticAccountKeys || tx.message.accountKeys;
    if (tx.message.header.numRequiredSignatures !== 1 || keys[0].toBase58() !== params.taker) { transaction = null; unavailable = 'This quote requires a sponsored or co-signed route. Fund your wallet with SOL and refresh.'; }
  }
  const now = Date.now(), providerExpiry = Date.parse(data.expireAt);
  return { ...params, inAmount: data.inAmount, outAmount: data.outAmount, minimumOut: data.otherAmountThreshold, transaction,
    requestId: data.requestId, lastValidBlockHeight: data.lastValidBlockHeight, expiresAt: Math.min(now + 20000, Number.isFinite(providerExpiry) ? providerExpiry : now + 20000),
    priceImpact: Number.isFinite(data.priceImpact) ? data.priceImpact : Number.isFinite(Number(data.priceImpactPct)) ? Number(data.priceImpactPct) * 100 : null,
    feeBps: data.feeBps ?? data.platformFee?.feeBps ?? 0, networkFee: Number(data.signatureFeeLamports || 0) + Number(data.prioritizationFeeLamports || 0), rentFee: Number(data.rentFeeLamports || 0),
    route: [...new Set((data.routePlan || []).map(step => step.swapInfo?.label).filter(Boolean))].join(' → ') || data.router || 'Jupiter', unavailable };
}
export async function executeTrade(input, apiKey) {
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.requestId) || typeof input.signedTransaction !== 'string' || input.signedTransaction.length > 4000 || !/^[A-Za-z0-9+/]+=*$/.test(input.signedTransaction)) throw invalid('Invalid signed swap.');
  const wallet = address(input.wallet);
  let tx;
  try { tx = VersionedTransaction.deserialize(Uint8Array.from(atob(input.signedTransaction), c => c.charCodeAt(0))); } catch { throw invalid('Invalid signed swap.'); }
  const keys = tx.message.staticAccountKeys || tx.message.accountKeys;
  if (tx.message.header.numRequiredSignatures !== 1 || keys[0].toBase58() !== wallet || !tx.signatures[0]?.some(Boolean)) throw invalid('The connected wallet must sign this swap.');
  const data = await jupiter('execute', apiKey, { method: 'POST', body: JSON.stringify({ signedTransaction: input.signedTransaction, requestId: input.requestId }) });
  return { status: data.status, signature: data.signature, error: data.error, code: data.code, totalInputAmount: data.totalInputAmount, totalOutputAmount: data.totalOutputAmount };
}