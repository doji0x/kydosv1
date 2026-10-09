import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { mainnetConnection } from '@/lib/solana/development';
import { Activity, useActivity } from '@/lib/solana/Activity';
import { formatDbcAmount, readDbcLaunch, readDbcPositions, validateDbcRelease, verifyDbcRelease } from '@/lib/solana/dbcBrowser';
import { discardDbcReview, prepareDbcReview, submitDbcReview } from '@/lib/solana/dbcReview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const panel = 'space-y-4 rounded-xl border border-border bg-card/80 p-5';
const stageText = { verifying: 'Verifying release...', reviewing: 'Building and simulating...',
  simulating: 'Checking transaction...', signing: 'Approve in Phantom...', submitting: 'Submitting...', confirming: 'Confirming...' };

/** Opt-in devnet workspace; existing /launch stays closed unless explicitly enabled. */
export default function DbcWorkspace() {
  const wallet = useSolanaWallet(), walletId = wallet.publicKey?.toBase58() || '';
  const [connection] = useState(() => mainnetConnection()); // Existing proxy; actual genesis hash is verified below.
  const configured = useMemo(() => {
    try { return { release: validateDbcRelease(JSON.parse(import.meta.env.VITE_KYDOS_DBC_RELEASE || 'null')) }; }
    catch (error) { return { error: error.message }; }
  }, []);
  const initialMint = useMemo(() => new URLSearchParams(window.location.search).get('dbcMint') || '', []);
  const [mode, setMode] = useState(initialMint ? 'fees' : 'create');
  const [mint, setMint] = useState(initialMint), [record, setRecord] = useState(null), [positions, setPositions] = useState([]);
  const [form, setForm] = useState({ name: '', symbol: '', metadataUri: '' });
  const [review, setReview] = useState(null), [result, setResult] = useState(null);
  const [error, setError] = useState(''), [phase, setPhase] = useState(''), [verified, setVerified] = useState(false);
  const lock = useRef(false), mounted = useRef(true), live = useRef(''), reviewRef = useRef(null);
  const context = JSON.stringify([walletId, mode, mint, form]); live.current = context;
  reviewRef.current = review;
  const activity = useActivity(connection, walletId, mode === 'create' ? 'create' : `fees:${mint.trim()}`);
  const busy = !!phase;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; discardDbcReview(reviewRef.current); };
  }, []);
  useEffect(() => {
    discardDbcReview(reviewRef.current); setReview(null); setError('');
  }, [context]);
  useEffect(() => { setRecord(null); setPositions([]); }, [mint]);

  async function run(action, phaseName = 'reviewing') {
    if (lock.current) return;
    lock.current = true; setPhase(phaseName); setError('');
    const expected = live.current;
    const ensure = () => {
      if (!mounted.current || expected !== live.current) throw new Error('Wallet or form changed. Review again.');
    };
    try { await action(ensure); }
    catch (failure) { if (mounted.current && expected === live.current) setError(failure.message); }
    finally { lock.current = false; if (mounted.current) setPhase(''); }
  }
  const verify = () => run(async ensure => {
    setVerified(false);
    await verifyDbcRelease(connection, configured.release); ensure(); setVerified(true);
  }, 'verifying');
  const connect = () => run(async () => { await wallet.connect(); });
  const load = () => run(async ensure => {
    setRecord(null); setPositions([]);
    if (!configured.release) throw new Error(configured.error);
    await verifyDbcRelease(connection, configured.release); ensure();
    const next = await readDbcLaunch(connection, mint.trim(), configured.release.config);
    const found = next.stage === 'migrated' ? await readDbcPositions(connection, next) : [];
    ensure(); setRecord(next); setPositions([...found]); setVerified(true);
  });
  const prepare = (operation, nft = undefined) => run(async ensure => {
    discardDbcReview(reviewRef.current); setReview(null); setResult(null);
    const next = await prepareDbcReview({ connection, wallet, release: configured.release, operation,
      name: form.name.trim(), symbol: form.symbol.trim(), metadataUri: form.metadataUri.trim(), mint: mint.trim(), nft });
    try { ensure(); } catch (failure) { discardDbcReview(next); throw failure; }
    setReview(next); setVerified(true);
  });
  const submit = () => run(async ensure => {
    try {
      const next = await submitDbcReview({ connection, wallet, review, release: configured.release,
        ensureCurrent: ensure, onStage: value => { if (mounted.current) setPhase(value); } });
      ensure(); setResult(next);
      if (next.operation !== 'create') {
        // Refresh failure must not turn a confirmed transaction into a failed one.
        try { const refreshed = await readDbcLaunch(connection, next.mint, configured.release.config); ensure(); setRecord(refreshed); }
        catch { setError('Transaction confirmed. Refresh the launch to retrieve updated counters. Do not resubmit.'); }
      }
    } finally { discardDbcReview(review); if (mounted.current) setReview(null); }
  });
  const edit = () => { discardDbcReview(review); setReview(null); };
  const blocked = busy || !!configured.error || activity.blocked || !wallet.connected;
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
    <header><p className="text-xs uppercase tracking-widest text-primary">Kydos DBC integration preview</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Launch and fee settlement</h1>
      <p className="mt-2 text-sm text-muted-foreground">Devnet only. The public launch remains closed. These actions use your connected Phantom wallet, not the admin server wallet.</p>
    </header>
    <section className={panel} aria-label="DBC release status">
      <p className="text-sm">{verified ? 'Devnet release matched the configured hashes at the last check.' : 'A verified devnet configuration is required before signing.'}</p>
      {configured.error && <p role="alert" className="text-sm text-destructive">{configured.error}</p>}
      {configured.release && <p className="break-all font-mono text-xs">Configuration: {configured.release.config}</p>}
      {walletId && <p className="break-all font-mono text-xs">Phantom: {walletId}</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !!configured.error} variant="outline" onClick={verify}>Verify release</Button>
        {!wallet.connected && <Button disabled={busy} onClick={connect}>Connect Phantom</Button>}</div>
    </section>
    <nav className="flex gap-2" aria-label="DBC workspace mode">
      <Button disabled={busy} variant={mode === 'create' ? 'default' : 'outline'} onClick={() => setMode('create')}>Create token</Button>
      <Button disabled={busy} variant={mode === 'fees' ? 'default' : 'outline'} onClick={() => setMode('fees')}>Trading fees</Button>
    </nav>
    {mode === 'create' ? <form className={panel} onSubmit={event => { event.preventDefault(); prepare('create'); }}>
      <h2 className="text-lg font-semibold">Create a registered DBC token</h2>
      <p className="text-sm text-muted-foreground">Creation and original-creator registration happen together. This preview uses a hosted metadata URI and does not include an initial buy.</p>
      {['name', 'symbol', 'metadataUri'].map(key => <label key={key} className="block space-y-2 text-sm" htmlFor={`dbc-${key}`}>
        <span>{{ name: 'Token name', symbol: 'Ticker', metadataUri: 'Metadata URI (HTTPS, IPFS or Arweave)' }[key]}</span>
        <Input id={`dbc-${key}`} value={form[key]} required disabled={busy || !!review} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))}/>
      </label>)}
      <p className="text-xs text-muted-foreground">Approved nominal allocation: 793.1M curve / 206.9M migration, with 1B initial supply. No legacy bonding-curve transaction is used.</p>
      {!review && <Button type="submit" disabled={blocked}>Review DBC creation</Button>}
    </form> : <section className={panel}>
      <h2 className="text-lg font-semibold">Read a registered launch</h2>
      <label className="block space-y-2 text-sm" htmlFor="dbc-mint"><span>Token mint</span><Input id="dbc-mint" value={mint} disabled={busy || !!review} onChange={event => setMint(event.target.value)}/></label>
      <Button disabled={busy || !!configured.error || !mint.trim()} variant="outline" onClick={load}>Read launch and positions</Button>
      {record && <div className="space-y-3 text-sm">
        <p>Stage: <strong>{record.stage}</strong></p>
        <p className="break-all">Original creator: <span className="font-mono text-xs">{record.creator.toBase58()}</span></p>
        <p>Base burned: {formatDbcAmount(record.baseBurned, 6)} tokens</p>
        <p>Creator paid: {formatDbcAmount(record.creatorQuotePaid)} WSOL</p>
        <p>Kydos post-migration revenue: {formatDbcAmount(record.kydosQuotePaid)} WSOL</p>
        <p>Kydos bonding revenue: {formatDbcAmount(record.bondingQuotePaid)} WSOL</p>
        <p className="text-xs text-muted-foreground">Settlement burns newly claimed base and pays net quote 50/50. The caller separately sponsors rent and network fees. Payouts remain WSOL; no existing wallet balance is unwrapped or swept.</p>
        {positions.map(position => <div key={position.nft} className="space-y-2 border-t border-border pt-3">
          <p className="break-all font-mono text-xs">Locked position: {position.position}</p>
          <Button disabled={blocked || !!review} onClick={() => prepare('settle', position.nft)}>Review 50/50 settlement and burn</Button>
        </div>)}
        {record.stage === 'migrated' && positions.length === 0 && <p role="status">No qualifying Kydos-custodied position found. Settlement is unavailable.</p>}
        {record.stage !== 'migrated' && <p role="status">Post-migration settlement becomes available after verified graduation. This page does not execute graduation or trades.</p>}
        <details><summary>Bonding-phase fees</summary><p className="my-2 text-xs">These historical partner fees go only to Kydos, including claims after graduation. They are not creator revenue.</p>
          <Button disabled={blocked || !!review} variant="outline" onClick={() => prepare('bonding')}>Review Kydos bonding-fee collection</Button></details>
      </div>}
    </section>}
    {review && <section className={panel} aria-label="Review DBC transaction">
      <h2 className="text-lg font-semibold">Review before Phantom</h2>
      <p className="break-all text-xs">Mint: {review.mint}</p>
      <p className="break-all text-xs">Original creator: {review.creator}</p>
      <p className="break-all text-xs">Kydos treasury: {review.treasury}</p>
      {review.preview && <div className="text-sm"><p>Simulated base burn: {formatDbcAmount(review.preview.baseBurned, 6)} tokens</p>
        <p>Simulated creator payout: {formatDbcAmount(review.preview.creatorQuote)} WSOL</p>
        <p>Simulated Kydos payout: {formatDbcAmount(review.preview.kydosQuote)} WSOL</p></div>}
      <dl className="space-y-1 text-sm">
        {[['Network fee', review.costs.networkFeeLamports], ['Account rent budget', review.costs.rentLamports],
          ['Metadata creation fee', review.costs.metadataFeeLamports], ['Total estimated SOL needed', review.costs.requiredLamports]]
          .map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd>{formatDbcAmount(amount)} SOL</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">The exact transaction is simulated again before signing. Claimable amounts may change with trading. Account rent is budgeted conservatively; unused SOL stays in your wallet. Any higher execution budget requires a fresh review.</p>
      <div className="flex gap-3"><Button disabled={busy} variant="outline" onClick={edit}>Cancel review</Button>
        <Button disabled={blocked} onClick={submit}>Approve with Phantom</Button></div>
    </section>}
    {busy && <p role="status">{stageText[phase] || 'Checking...'}</p>}
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
    {result && <section className={panel} role="status"><h2 className="font-semibold">Transaction confirmed</h2><p className="break-all font-mono text-xs">{result.signature}</p>
      <a className="underline" href={`https://solscan.io/tx/${result.signature}?cluster=devnet`} target="_blank" rel="noreferrer">View devnet transaction</a>
      {result.operation === 'create' && <p><a className="underline" href={`/launch?dbcMint=${result.mint}`}>Read this DBC launch</a></p>}
    </section>}
    <Activity activity={activity} connection={connection}/>
  </main>;
}
