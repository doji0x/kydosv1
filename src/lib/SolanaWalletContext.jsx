import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPhantomSigner } from './solana/phantom.js';
const Context = createContext(null);

export function SolanaWalletProvider({ children }) {
  const [publicKey, setPublicKey] = useState(null);
  const injected = typeof window !== 'undefined' ? window.phantom?.solana ?? window.solana : null;
  const phantom = injected?.isPhantom ? injected : null;
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
    return {
      installed: !!phantom, connected: !!publicKey, publicKey, connect, disconnect,
      ...createPhantomSigner(phantom, publicKey),
    };
  }, [phantom, publicKey, connect, disconnect]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSolanaWallet() {
  const value = useContext(Context);
  if (!value) throw new Error('SolanaWalletProvider is missing');
  return value;
}
