import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Server } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import AdminLaunchForm from '@/components/solana/AdminLaunchForm';
import { validateLaunchImage, validateMetadataDetails } from '@/lib/solana/launchMetadata';
const PENDING_KEY = 'kydos:admin-launch:pending:v1';
const message = reason => reason?.response?.data?.error || reason.message;
const sol = lamports => ((lamports || 0) / 1e9).toFixed(9);
const resolved = state => ['confirmed', 'failed'].includes(state);
export default function AdminLaunch() {
  const [user, setUser] = useState(), [wallet, setWallet] = useState();
  const [form, setForm] = useState({ name: '', symbol: '', image: null });
  const [statusText, setStatusText] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [logs, setLogs] = useState([]), [result, setResult] = useState();
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const { data } = await base44.functions.invoke('adminLaunchToken', { action: 'status' });
    setWallet(data); return data;
  }, []);
  useEffect(() => {
    let active = true;
    base44.auth.me().then(async current => {
      if (!active) return;
      setUser(current);
      if (current.role === 'admin') {
        const stored = localStorage.getItem(PENDING_KEY);
        if (stored) setResult(JSON.parse(stored));
        await refresh();
      }
    }).catch(reason => { if (active) { setError(message(reason)); setUser(previous => previous ?? null); } });
    return () => { active = false; };
  }, [refresh]);
  const unresolved = result && !resolved(result.state);
  const check = async () => {
    if (!result?.requestId) return;
    try {
      const { data } = await base44.functions.invoke('adminLaunchToken', { action: 'check', requestId: result.requestId, chain: result.network.chain });
      const next = { ...result, ...data }; setResult(next);
      if (resolved(data.state)) { localStorage.removeItem(PENDING_KEY); await refresh(); }
      else localStorage.setItem(PENDING_KEY, JSON.stringify(next));
    } catch (reason) { setError(message(reason)); }
  };
  const submit = async event => {
    event.preventDefault(); if (lock.current || unresolved) return;
    lock.current = true; setBusy(true); setError(''); setLogs([]); setResult();
    let attempted = false;
    try {
      setStatusText('Checking server wallet…');
      const current = await refresh();
      if (!current.ready) throw new Error(current.blockedReason);
      const details = { name: form.name.trim(), symbol: form.symbol.trim().toUpperCase() };
      validateMetadataDetails(details); await validateLaunchImage(form.image);
      setStatusText('Uploading photo…');
      const { file_url: imageUrl } = await base44.integrations.Core.UploadPublicFile({ file: form.image });
      setStatusText('Saving token details…');
      const metadata = new File([JSON.stringify({ ...details, image: imageUrl })], 'metadata.json', { type: 'application/json' });
      const { file_url: metadataUri } = await base44.integrations.Core.UploadPublicFile({ file: metadata });
      setStatusText('Simulating and submitting on ' + current.network.name + '…');
      const pending = { state: 'unknown', requestId: crypto.randomUUID(), wallet: current.wallet, network: current.network, startedAt: new Date().toISOString() };
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      if (!localStorage.getItem(PENDING_KEY)) throw new Error('Unable to save launch recovery information.');
      setResult(pending); attempted = true;
      const { data } = await base44.functions.invoke('adminLaunchToken', { action: 'launch', ...details, metadataUri,
        expectedChain: current.network.chain, expectedWallet: current.wallet, requestId: pending.requestId });
      setResult(data);
      if (resolved(data.state)) localStorage.removeItem(PENDING_KEY);
      else localStorage.setItem(PENDING_KEY, JSON.stringify(data));
      if (data.error) setError(data.error);
      await refresh();
    } catch (reason) {
      const data = reason?.response?.data; setError(message(reason)); setLogs(data?.logs || []);
      if (!attempted || data?.submitted === false) { localStorage.removeItem(PENDING_KEY); setResult(); }
    } finally { lock.current = false; setBusy(false); }
  };
  if (user === undefined) return <p role="status" className="p-8 text-center">Checking admin access…</p>;
  if (user?.role !== 'admin') return <div className="p-8 text-center"><h1 className="text-xl font-semibold">Admin access required</h1>{error && <p role="alert">{error}</p>}<Link to="/">Return home</Link></div>;
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
    <Link to="/admin/astra" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Back to Astra</Link>
    <div><p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-primary"><Server className="h-4 w-4"/>Admin · Server wallet</p><h1 className="font-display text-3xl font-bold">Create a test token</h1><p className="mt-2 text-sm text-muted-foreground">Launch using the server wallet and network shown below.</p></div>
    {!wallet && <Button variant="outline" disabled={busy} onClick={() => refresh().catch(reason => setError(message(reason)))}>Retry launch status</Button>}
    {wallet && <section className="space-y-2 rounded-xl border border-border bg-secondary/50 p-4">
      <p className="text-sm font-semibold">{wallet.network.name}</p><p className="break-all font-mono text-xs">{wallet.wallet}</p>
      <p className="text-sm">Balance: {sol(wallet.balanceLamports)} SOL · Estimated required: {sol(wallet.requiredLamports)} SOL</p>
      <p className="text-xs text-muted-foreground">Includes account deposits, metadata creation fee, and transaction fees. Your Phantom balance is separate.</p>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => refresh().catch(reason => setError(message(reason)))}>Refresh funding and network</Button>
    </section>}
    <AdminLaunchForm form={form} setForm={setForm} busy={busy} statusText={statusText} onSubmit={submit} networkName={wallet?.network?.name}
      blockedReason={unresolved ? 'Resolve the previous submission before launching another token.' : wallet?.blockedReason || (!wallet ? 'Checking launch availability…' : '')}/>
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
    {logs.length > 0 && <details className="text-xs"><summary>Simulation details</summary><pre className="overflow-auto whitespace-pre-wrap">{logs.join('\n')}</pre></details>}
    {result && <section role="status" className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
      <p className="font-semibold">{result.state === 'confirmed' ? 'Token created' : result.state === 'failed' ? 'Transaction failed on chain' : 'Checking launch outcome'}</p>
      {result.mint && <p className="break-all font-mono text-xs">Mint: {result.mint}</p>}
      {result.signature ? <a className="text-primary underline" href={'https://solscan.io/tx/' + result.signature + result.network.explorerQuery} target="_blank" rel="noreferrer">View transaction</a> : <p>The response was interrupted. Recover the saved receipt before attempting another launch.</p>}
      {unresolved && <Button className="ml-3" size="sm" variant="outline" onClick={check}>Check confirmation</Button>}
      {result.state === 'confirmed' && <Link className="block text-primary underline" to={'/solana/' + result.mint}>Open market</Link>}
    </section>}
  </main>;
}
