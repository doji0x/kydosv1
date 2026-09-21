import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { createLaunch } from '@/lib/solana/client';
import { developmentConnection } from '@/lib/solana/development';
import { transactionError, validateLaunch } from '@/lib/solana/market';
import { Activity, useActivity } from '@/lib/solana/Activity';

export default function SolanaLaunch() {
  const wallet = useSolanaWallet();
  const walletId = wallet.publicKey?.toBase58();
  const [rpc] = useState(() => { try { return { connection: developmentConnection() }; } catch (e) { return { error: e.message }; } });
  const activity = useActivity(rpc.connection, walletId, 'create');
  const [form, setForm] = useState({ name: '', symbol: '', metadataUri: '' });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const lock = useRef(false);
  const set = key => e => setForm(previous => ({ ...previous, [key]: e.target.value }));
  const blocked = busy || activity.blocked || !rpc.connection;
  const connect = async () => {
    try { await wallet.connect(); } catch (e) { setOutcome({ wallet: walletId, message: transactionError(e) }); }
  };
  const submit = async e => {
    e.preventDefault();
    if (lock.current || blocked || !wallet.connected) return;
    lock.current = true; setBusy(true);
    setOutcome({ wallet: walletId, message: 'Approve in your wallet. Recovery metadata will be saved before broadcast.' });
    try {
      validateLaunch(form);
      await createLaunch({ connection: rpc.connection, wallet, ...form });
      setOutcome({ wallet: walletId, message: 'Creation confirmed. Open your market from persistent activity.' });
    } catch (error) {
      setOutcome({ wallet: walletId, message: transactionError(error) });
    } finally { lock.current = false; setBusy(false); }
  };
  return <main className="mx-auto max-w-xl px-4 py-8 pb-24 space-y-5">
    <Link to="/launch" className="text-xs text-muted-foreground">Robinhood launch</Link>
    <h1 className="text-3xl font-semibold">Launch on Solana</h1>
    <p className="text-sm text-muted-foreground">Local development against the existing program, not approved economics or production readiness. Loopback RPC only; disposable test funds only. Existing hosted metadata URI required. This does not deploy a program or implement external migration.</p>
    {rpc.error && <p role="alert">{rpc.error}</p>}
    <form onSubmit={submit} className="space-y-5">
      <label className="block">Name (32 UTF-8 bytes maximum)<Input required value={form.name} disabled={blocked} onChange={set('name')} /></label>
      <label className="block">Symbol (10 UTF-8 bytes maximum)<Input required value={form.symbol} disabled={blocked} onChange={set('symbol')} /></label>
      <label className="block">Hosted metadata URI (200 UTF-8 bytes maximum)<Input required value={form.metadataUri} disabled={blocked} onChange={set('metadataUri')} placeholder="https://.../metadata.json" /></label>
      {!wallet.connected && <Button type="button" variant="outline" disabled={busy} onClick={connect}>Connect Phantom</Button>}
      {wallet.connected && <p className="break-all text-xs">Wallet: {walletId}</p>}
      <Button type="submit" disabled={blocked || !wallet.connected}>{busy ? 'Awaiting transaction…' : 'Create development token'}</Button>
    </form>
    {outcome?.wallet === walletId && <p role="status">{outcome.message}</p>}
    <Activity activity={activity} connection={rpc.connection} />
  </main>;
}
