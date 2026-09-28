import { SOL, USDC, address, invalid } from './jupiterTrading.js';

export async function swapBalances(input, endpoint) {
  const mint = address(input.mint), wallet = address(input.wallet), tokenMint = mint === SOL ? USDC : mint;
  if (!endpoint) throw invalid('Wallet balances are temporarily unavailable.', 503);
  const rpc = async (method, params) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000), redirect: 'manual' });
    const data = await response.json();
    if (!response.ok || data.error) throw invalid('Unable to read confirmed wallet balances. Refresh and try again.', 503);
    return data.result;
  };
  const [native, info, accounts] = await Promise.all([
    rpc('getBalance', [wallet, { commitment: 'confirmed' }]),
    rpc('getAccountInfo', [tokenMint, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
    rpc('getTokenAccountsByOwner', [wallet, { mint: tokenMint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
  ]);
  const parsed = info?.value?.data?.parsed, decimals = parsed?.info?.decimals;
  if (parsed?.type !== 'mint' || !Number.isInteger(decimals) || decimals < 0 || decimals > 255 || !['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'].includes(info.value.owner)) throw invalid('This address is not a supported Solana token mint.', 422);
  if (!Number.isSafeInteger(native?.value) || native.value < 0 || !Array.isArray(accounts?.value)) throw invalid('Wallet balance response was incomplete.', 503);
  const tokenBalance = accounts.value.reduce((sum, account) => {
    const details = account.account?.data?.parsed?.info;
    if (details?.mint !== tokenMint || details.owner !== wallet || !/^\d+$/.test(details.tokenAmount?.amount)) throw invalid('Wallet token balance response was incomplete.', 503);
    return details.state === 'frozen' ? sum : sum + BigInt(details.tokenAmount.amount);
  }, 0n).toString();
  return { mint, wallet, decimals: mint === SOL ? 9 : decimals, tokenBalance: mint === SOL ? String(native.value) : tokenBalance,
    counterBalance: mint === SOL ? tokenBalance : String(native.value), solBalance: String(native.value), fetchedAt: Date.now() };
}