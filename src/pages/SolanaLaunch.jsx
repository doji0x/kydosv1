import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { createLaunch } from '@/lib/solana/client';
import { developmentConnection } from '@/lib/solana/development';
import { transactionError, validateLaunch } from '@/lib/solana/market';
import { checkTransaction } from '@/lib/solana/transactions';

export default function SolanaLaunch() {
  const wallet = useSolanaWallet();
  const [form, setForm] = useState({ name: '', symbol: '', metadataUri: '' });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const lock = useRef(false);
  const set = key => e => setForm(previous => ({ ...previous, [key]: e.target.value }));
  const blocked = busy || ['unknown', 'confirmed'].includes(outcome?.state);
  const connect = async () => {
    try { await wallet.connect(); } catch (e) { setOutcome({ state: 'error', message: transactionError(e) }); }
  };
  const submit = async e => {
    e.preventDefault();
    if (lock.current || blocked || !wallet.connected) return;
    lock.current = true; setBusy(true);
    setOutcome({ state: 'pending', message: 'Approve in your wallet, then wait for confirmation. Keep this page open.' });
    try {
      validateLaunch(form);
      const result = await createLaunch({ connection: developmentConnection(), wallet, ...form });
      setOutcome({ ...result, state: 'confirmed', message: 'Creation confirmed. Open your market below.' });
    } catch (error) {
      setOutcome({ state: error.state || 'error', mint: error.mint, signature: error.signature, message: transactionError(error) });
    } finally { lock.current = false; setBusy(false); }
  };
  const recheck = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await checkTransaction(developmentConnection(), outcome.signature);
      setOutcome(previous => ({ ...previous, ...result }));
    } catch { setOutcome(previous => ({ ...previous, message: 'Status unavailable. Creation may have landed; do not create another mint.' })); }
    finally { lock.current = false; setBusy(false); }
  };
  return <main className="mx-auto max-w-xl px-4 py-8 pb-24 space-y-5">
    <Link to="/launch" className="text-xs text-muted-foreground">Robinhood launch</Link>
    <h1 className="text-3xl font-semibold">Launch on Solana</h1>
    <p className="text-sm text-muted-foreground">Local development implementation against the existing program, not approved economics or production readiness. Loopback RPC only; test funds only. Existing hosted metadata URI required. This does not deploy a program or implement external migration.</p>
    <form onSubmit={submit} className="space-y-5">
      <label className="block">Name (32 UTF-8 bytes maximum)<Input required value={form.name} disabled={blocked} onChange={set('name')} /></label>
      <label className="block">Symbol (10 UTF-8 bytes maximum)<Input required value={form.symbol} disabled={blocked} onChange={set('symbol')} /></label>
      <label className="block">Hosted metadata URI (200 UTF-8 bytes maximum)<Input required value={form.metadataUri} disabled={blocked} onChange={set('metadataUri')} placeholder="https://.../metadata.json" /></label>
      {!wallet.connected && <Button type="button" variant="outline" disabled={blocked} onClick={connect}>Connect Phantom</Button>}
      {wallet.connected && <p className="break-all text-xs">Wallet: {wallet.publicKey.toBase58()}</p>}
      <Button type="submit" disabled={blocked || !wallet.connected}>{busy ? 'Awaiting transaction…' : 'Create development token'}</Button>
    </form>
    {outcome && <section role="status" aria-live="polite" className="space-y-3">
      <p>{outcome.message}</p>
      {outcome.signature && <p className="break-all text-xs">Signature: {outcome.signature}</p>}
      {outcome.mint && <p className="break-all text-xs">Mint: {outcome.mint}</p>}
      {outcome.state === 'unknown' && <><p>Save the mint and signature before leaving. Creation remains locked to prevent duplicate mints.</p><Button disabled={busy} onClick={recheck}>Check signature status</Button></>}
      {outcome.state === 'confirmed' && <Link className="underline" to={`/solana/${outcome.mint}`}>Open Solana market / trade</Link>}
    </section>}
  </main>;
}
