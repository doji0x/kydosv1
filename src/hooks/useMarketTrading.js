import { useCallback, useEffect, useRef, useState } from 'react';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { fetchBalances, fetchMarket, trade } from '@/lib/solana/client';
import { mainnetConnection } from '@/lib/solana/development';
import { parseAmount, quoteTrade, transactionError } from '@/lib/solana/market';
import { useActivity } from '@/lib/solana/Activity';

export default function useMarketTrading(mint, onConfirmed) {
  const wallet = useSolanaWallet(), walletId = wallet.publicKey?.toBase58();
  const [rpc] = useState(() => { try { return { connection: mainnetConnection() }; } catch (error) { return { error: error.message }; } });
  const activity = useActivity(rpc.connection, walletId, `trade:${mint}`);
  const [market, setMarket] = useState(null), [balances, setBalances] = useState(null), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
  const [side, setSide] = useState('buy'), [amount, setAmount] = useState(''), [bps, setBps] = useState('100'), [busy, setBusy] = useState(false), [outcome, setOutcome] = useState(''), [now, setNow] = useState(Date.now());
  const generation = useRef(0), lock = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current; setLoading(true); setLoadError('');
    try {
      if (!rpc.connection) throw new Error(rpc.error);
      const [nextMarket, nextBalances] = await Promise.all([fetchMarket(rpc.connection, mint), walletId ? fetchBalances(rpc.connection, walletId, mint) : null]);
      if (request === generation.current) { setMarket({ ...nextMarket, loadedAt: Date.now() }); setBalances(nextBalances); }
    } catch (error) { if (request === generation.current) setLoadError(error.message); }
    finally { if (request === generation.current) setLoading(false); }
  }, [rpc, mint, walletId]);
  useEffect(() => { refresh(); return () => { generation.current++; }; }, [refresh]);
  useEffect(() => { if (busy) return; const timer = setInterval(() => { setNow(Date.now()); refresh(); }, 10000); return () => clearInterval(timer); }, [busy, refresh]);
  const stale = !!market && now - market.loadedAt > 30000;
  let quote = null, quoteError = '';
  try {
    if (market && amount) { quote = quoteTrade(market, side, parseAmount(amount, side === 'buy' ? 9 : market.decimals), Number(bps));
      if (balances && quote.input > (side === 'buy' ? balances.sol : balances.tokens)) throw new Error('Input exceeds confirmed balance'); }
  } catch (error) { quoteError = error.message; quote = null; }
  const blocked = busy || activity.blocked;
  const submit = async event => {
    event.preventDefault(); if (lock.current || blocked || !quote || !balances || !market || !wallet.connected) return;
    lock.current = true; setBusy(true); setOutcome('Approve the mainnet transaction in Phantom.');
    try { await trade({ connection: rpc.connection, wallet, mint, side, amount: quote.input, minOut: quote.minOut }); setOutcome('Trade confirmed on mainnet.'); setAmount(''); await refresh(); await onConfirmed?.(); }
    catch (error) { setOutcome(transactionError(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  const connect = async () => { try { await wallet.connect(); } catch (error) { setOutcome(transactionError(error)); } };
  return { wallet, walletId, rpc, activity, market, balances, loading, loadError, side, setSide, amount, setAmount, bps, setBps,
    busy, outcome, quote, quoteError, blocked, stale, refresh, connect, submit, canSubmit: !blocked && !stale && wallet.connected && !!balances && !!quote && !loading };
}