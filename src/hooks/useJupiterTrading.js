import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { mainnetConnection } from '@/lib/solana/development';
import useJupiterQuote from '@/hooks/useJupiterQuote';
import useJupiterActivity from '@/hooks/useJupiterActivity';
import executeJupiterTrade from '@/lib/jupiterExecution';

export default function useJupiterTrading(mint) {
  const wallet = useSolanaWallet(), auth = useAuth(), cache = useQueryClient(), walletId = wallet.publicKey?.toBase58();
  const [connection] = useState(mainnetConnection), lock = useRef(false);
  const [side, setSide] = useState('buy'), [amount, setAmount] = useState(''), [slippage, setSlippage] = useState('1');
  const [busy, setBusy] = useState(false), [connecting, setConnecting] = useState(false), [message, setMessage] = useState('');
  const activity = useJupiterActivity(walletId);
  const quote = useJupiterQuote({ mint, wallet: walletId, side, amount, slippage, enabled: auth.isAuthenticated, busy });
  const refresh = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ['jupiter-balances'] }), cache.invalidateQueries({ queryKey: ['market-discovery'] })]); };
  const connect = async () => {
    setConnecting(true); setMessage('');
    try { await wallet.connect(); } catch (error) { setMessage(error.message); }
    finally { setConnecting(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (lock.current || activity.blocked || !quote.ready) return;
    lock.current = true; setBusy(true); setMessage('Review the swap in Phantom.');
    try {
      await executeJupiterTrade({ order: quote.order, wallet, mint, side, connection });
      setAmount(''); setMessage('Swap confirmed. Updating your balances.'); await refresh();
    } catch (error) { setMessage(error.code === 4001 ? 'Wallet approval rejected. Nothing was submitted.' : error.message); }
    finally { lock.current = false; setBusy(false); activity.refresh(); cache.removeQueries({ queryKey: ['jupiter-order', mint, walletId] }); }
  };
  return { ...quote, auth, wallet, walletId, connection, activity, side, amount, slippage, busy, connecting, message, connect, submit, refresh,
    setSide: value => { setSide(value); setAmount(''); setMessage(''); }, setAmount, setSlippage };
}