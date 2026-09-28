import React, { useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';

export default function WalletConnectPrompt({ title = 'Your profile lives here', description = 'Connect Phantom to use your wallet profile on Kydos.' }) {
  const wallet = useSolanaWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    setBusy(true); setError('');
    try { await wallet.connect(); }
    catch (reason) { setError(reason.message || 'Could not connect Phantom.'); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-2xl px-5 py-20 text-center">
    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><Wallet className="h-8 w-8" /></div>
    <h1 className="font-display text-2xl font-bold">{title}</h1>
    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    <Button onClick={connect} disabled={busy} className="mt-6 h-11 rounded-full px-7 font-semibold gold-glow">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Connect Phantom wallet</Button>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </div>;
}