import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { counterAsset, swapAmount, tradingRequest } from '@/lib/jupiterTrade';

export default function useJupiterQuote({ mint, wallet, side, amount, slippage, enabled, busy }) {
  const counter = counterAsset(mint), [now, setNow] = useState(Date.now), [settled, setSettled] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { const timer = setTimeout(() => setSettled(amount), 400); return () => clearTimeout(timer); }, [amount]);
  const balances = useQuery({ queryKey: ['jupiter-balances', mint, wallet], queryFn: () => tradingRequest({ action: 'balances', mint, wallet }),
    enabled: enabled && !!wallet && !busy, refetchInterval: busy ? false : 10000, retry: false, staleTime: 5000 });
  const decimals = side === 'buy' ? counter.decimals : balances.data?.decimals;
  const outputDecimals = side === 'buy' ? balances.data?.decimals : counter.decimals;
  const available = side === 'buy' ? balances.data?.counterBalance : balances.data?.tokenBalance;
  let raw = '', inputError = '';
  const slippageBps = Math.round(Number(slippage) * 100);
  try {
    if (!Number.isFinite(Number(slippage)) || !/^\d+(\.\d{1,2})?$/.test(slippage) || slippageBps < 1 || slippageBps > 500) throw new Error('Choose slippage between 0.01% and 5%.');
    if (amount && decimals != null) {
      raw = swapAmount(amount, decimals);
      if (available != null && BigInt(raw) > BigInt(available)) throw new Error('Amount exceeds your available balance.');
    }
  } catch (error) { inputError = error.message; }
  const quote = useQuery({ queryKey: ['jupiter-order', mint, wallet, side, raw, slippageBps], queryFn: () => tradingRequest({ action: 'order', mint, wallet, side, amount: raw, slippageBps }),
    enabled: enabled && !!wallet && !!raw && !inputError && settled === amount && !busy && !!balances.data && !balances.isError,
    refetchInterval: busy ? false : 10000, staleTime: 5000, retry: false, gcTime: 60000 });
  const order = quote.data, expired = !order || now >= order.expiresAt;
  const error = inputError || balances.error?.message || quote.error?.message || order?.unavailable || '';
  return { balances, quote, order, raw, counter, decimals, outputDecimals, available, slippageBps, inputError, error, expired,
    ready: enabled && !!wallet && !!raw && !error && !expired && !!order?.transaction && !!order?.requestId && !busy && !quote.isFetching && !balances.isFetching && settled === amount };
}