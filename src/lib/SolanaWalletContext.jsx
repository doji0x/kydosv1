import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
const Context = createContext(null);

export function SolanaWalletProvider({ children }) {
  const [publicKey, setPublicKey] = useState(null);
  const phantom = typeof window !== 'undefined' && window.solana?.isPhantom ? window.solana : null;
  useEffect(() => {
    if (!phantom) return;
    const changed = key => setPublicKey(key || null);
    const disconnected = () => setPublicKey(null);
    phantom.on?.('accountChanged', changed);
    phantom.on?.('disconnect', disconnected);
    return () => {
      phantom.removeListener?.('accountChanged', changed);
      phantom.removeListener?.('disconnect', disconnected);
    };
  }, [phantom]);
  const connect = useCallback(async () => {
    if (!phantom) throw new Error('Install Phantom to continue');
    const result = await phantom.connect();
    setPublicKey(result.publicKey);
    return result.publicKey;
  }, [phantom]);
  const disconnect = useCallback(async () => {
    await phantom?.disconnect();
    setPublicKey(null);
  }, [phantom]);
  const value = useMemo(() => {
    const requireWallet = () => {
      if (!phantom || !publicKey || !phantom.publicKey?.equals(publicKey)) {
        throw new Error('Wallet account changed or disconnected. Reconnect before signing.');
      }
    };
    return {
      installed: !!phantom, connected: !!publicKey, publicKey, connect, disconnect,
      signTransaction: tx => { requireWallet(); return phantom.signTransaction(tx); },
      signAllTransactions: txs => { requireWallet(); return phantom.signAllTransactions(txs); },
    };
  }, [phantom, publicKey, connect, disconnect]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSolanaWallet() {
  const value = useContext(Context);
  if (!value) throw new Error('SolanaWalletProvider is missing');
  return value;
}
