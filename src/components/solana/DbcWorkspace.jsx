/// <reference types="vite/client" />
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { mainnetConnection } from '@/lib/solana/development';
import { Activity, useActivity } from '@/lib/solana/Activity';
import { DBC_ROUTE, MAINNET, formatDbcAmount, readDbcLaunch, readDbcPositions, validateDbcRelease, verifyDbcRelease } from '@/lib/solana/dbcBrowser';
import { discardDbcReview, prepareDbcReview, submitDbcReview } from '@/lib/solana/dbcReview';
import { dbcNetwork, dbcExplorerUrl, dbcLaunchUrl } from '@/lib/solana/dbcLinks';
import { createDbcMetadataSession } from '@/lib/solana/dbcMetadata';
import { validateLaunchImage, validateMetadataDetails } from '@/lib/solana/launchMetadata';
import { validateLaunch } from '@/lib/solana/market';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const panel = 'space-y-4 rounded-xl border border-border bg-card/80 p-5';
const emptyForm = { name: '', symbol: '', description: '', metadataUri: '', manualMetadata: false };
const stageText = { verifying: 'Verifying deployed programs and network...', reviewing: 'Building and simulating...',
  'validating-image': 'Checking image...', 'uploading-image': 'Uploading image...', 'uploading-metadata': 'Saving token metadata...',
  simulating: 'Checking transaction...', signing: 'Approve in Phantom...', submitting: 'Submitting...', confirming: 'Confirming...' };

/** Public launch flow. The independently reviewed manifest gates every transaction. */
export default function DbcWorkspace() {
  const wallet = useSolanaWallet(), walletId = wallet.publicKey?.toBase58() || '';
  const auth = useAuth();
  const [connection] = useState(() => mainnetConnection()); // Private RPC URL stays behind the existing proxy.
  const configured = useMemo(() => {
    try {
      const release = validateDbcRelease(JSON.parse(import.meta.env.VITE_KYDOS_DBC_RELEASE || 'null'));
      return { release, network: dbcNetwork(release.genesisHash) };
    } catch (failure) { return { error: failure.message }; }
  }, []);
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialMint = query.get('dbcMint') || '';
  const wrongLinkNetwork = !!query.get('network') && query.get('network') !== configured.network?.cluster;
  const [mode, setMode] = useState(initialMint ? 'fees' : 'create');
  const [mint, setMint] = useState(initialMint), [record, setRecord] = useState(null), [positions, setPositions] = useState([]);
  const [form, setForm] = useState(emptyForm), [file, setFile] = useState(null), [imagePreview, setImagePreview] = useState('');
  const [fileVersion, setFileVersion] = useState(0), [priority, setPriority] = useState(configured.network?.cluster === 'mainnet-beta' ? '100000' : '0');
  const [review, setReview] = useState(null), [result, setResult] = useState(null), [mainnetAcknowledged, setMainnetAcknowledged] = useState(false);
  const [error, setError] = useState(''), [phase, setPhase] = useState(''), [verified, setVerified] = useState(false), [copied, setCopied] = useState(false);
  const lock = useRef(false), mounted = useRef(true), live = useRef(''), reviewRef = useRef(null);
  const [metadataSession] = useState(createDbcMetadataSession);
  const context = JSON.stringify([walletId, auth.user?.id, mode, mint, form, fileVersion, priority]); live.current = context;
  reviewRef.current = review;
  const activity = useActivity(connection, walletId, mode === 'create' ? 'create' : `fees:${mint.trim()}`);
  const busy = !!phase, networkName = configured.network?.name || 'Solana';
  const isMainnet = configured.release?.genesisHash === MAINNET;
  const configError = configured.error || (wrongLinkNetwork ? 'This launch link belongs to a different network. Use the matching Kydos deployment.' : '');
  const blockedReason = configError || activity.error || (!wallet.connected ? 'Connect Phantom to review a transaction.' :
    !activity.chain ? 'Checking the RPC network...' : activity.chain !== configured.release?.genesisHash ? 'The RPC network does not match the launch configuration.' :
      activity.pending.length ? 'An earlier operation is unresolved. Reconcile transaction activity before continuing.' : '');
  const blocked = busy || !!blockedReason;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; discardDbcReview(reviewRef.current); };
  }, []);
  useEffect(() => {
    discardDbcReview(reviewRef.current); setReview(null); setResult(null); setError(''); setMainnetAcknowledged(false); setCopied(false);
  }, [context]);
  useEffect(() => { setRecord(null); setPositions([]); }, [mint]);
  useEffect(() => {
    if (!file) { setImagePreview(''); return; }
    const url = URL.createObjectURL(file); setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
    if (configError) throw new Error(configError);
    await verifyDbcRelease(connection, configured.release); ensure(); setVerified(true);
  }, 'verifying');
  const connect = () => run(async () => { await wallet.connect(); });
  const disconnect = () => run(async () => { await wallet.disconnect(); });
  const chooseImage = event => {
    const chosen = event.target.files?.[0]; event.target.value = '';
    if (chosen) run(async ensure => {
      await validateLaunchImage(chosen); ensure(); setFile(chosen); setFileVersion(value => value + 1);
    }, 'validating-image');
  };
  const load = () => run(async ensure => {
    setRecord(null); setPositions([]); setVerified(false);
    if (configError) throw new Error(configError);
    await verifyDbcRelease(connection, configured.release); ensure();
    const next = await readDbcLaunch(connection, mint.trim(), configured.release.config);
    const found = next.stage === 'migrated' ? await readDbcPositions(connection, next) : [];
    ensure(); setRecord(next); setPositions([...found]); setVerified(true);
  });
  // SolanaLaunch keys the workspace by URL search, so recovery/deep-link navigation
  // always mounts the correct mint and discards any previous unsigned review.
  useEffect(() => { if (initialMint && !configError) load(); }, []);
  const prepare = (operation, nft = undefined) => run(async ensure => {
    if (blockedReason) throw new Error(blockedReason);
    discardDbcReview(reviewRef.current); setReview(null); setResult(null); setVerified(false); setMainnetAcknowledged(false);
    const details = { name: form.name.trim(), symbol: form.symbol.trim(), description: form.description };
    let metadataUri = form.metadataUri.trim();
    if (operation === 'create') {
      if (form.manualMetadata) validateLaunch({ ...details, metadataUri });
      else {
        validateMetadataDetails(details); await validateLaunchImage(file); ensure();
        if (!auth.isAuthenticated) throw new Error('Sign in to upload an image, or select an existing metadata URI.');
        // Do not upload public files when the configured chain/programs are invalid.
        await verifyDbcRelease(connection, configured.release); ensure();
      }
      metadataUri = await metadataSession.resolve({ file, details, manualMetadata: form.manualMetadata, metadataUri,
        invoke: (name, body) => base44.functions.invoke(name, body), ensureCurrent: ensure,
        onStage: value => { ensure(); setPhase(value); },
      });
      ensure(); setPhase('reviewing');
    }
    const next = await prepareDbcReview({ connection, wallet, release: configured.release, operation,
      ...details, metadataUri, mint: mint.trim(), nft, priorityMicroLamports: BigInt(priority) });
    try { ensure(); } catch (failure) { discardDbcReview(next); throw failure; }
    setReview(next); setVerified(true);
  });
  const submit = () => run(async ensure => {
    if (blockedReason) throw new Error(blockedReason);
    try {
      const next = await submitDbcReview({ connection, wallet, review, release: configured.release, mainnetAcknowledged,
        ensureCurrent: ensure, onStage: value => { if (mounted.current) setPhase(value); } });
      ensure(); setResult(next);
      if (next.operation !== 'create') {
        // Refresh failure must not turn a confirmed transaction into a failed one.
        try { const refreshed = await readDbcLaunch(connection, next.mint, configured.release.config); ensure(); setRecord(refreshed); }
        catch { setError('Transaction confirmed. Refresh the launch to retrieve updated counters. Do not resubmit.'); }
      }
    } finally { discardDbcReview(review); if (mounted.current) { setReview(null); setMainnetAcknowledged(false); } }
  });
  const edit = () => { discardDbcReview(review); setReview(null); setMainnetAcknowledged(false); };
  const copyMint = async value => {
    try { await navigator.clipboard.writeText(value); if (mounted.current) setCopied(true); }
    catch { if (mounted.current) setError('Clipboard unavailable. Select and copy the displayed token address.'); }
  };
  const launches = activity.scoped.filter(item => item.state === 'confirmed' && item.scope.operation === 'create' && item.metadata.protocol === DBC_ROUTE);
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
    <header><p className="text-xs uppercase tracking-widest text-primary">Kydos token launchpad</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Launch your token</h1>
      <p className="mt-2 text-sm text-muted-foreground">Create on Meteora DBC with your connected Phantom wallet. You are registered as the original creator in the same transaction.</p>
    </header>
    <section className={panel} aria-label="DBC release status">
      <p className="font-semibold">{configured.network ? networkName : 'Launch configuration required'}</p>
      <p className="text-sm">{verified ? 'Deployed programs and fee policy matched the configured release at the last check.' : 'The network, deployed programs and fee policy are checked before every transaction.'}</p>
      {configError && <p role="alert" className="text-sm text-destructive">{configError} The operator must configure a verified release before transactions can be approved.</p>}
      {configured.release && <details className="text-xs"><summary>Release configuration</summary><p className="mt-2 break-all font-mono">{configured.release.config}</p></details>}
      {walletId && <p className="break-all font-mono text-xs">Phantom: {walletId}</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !!configError} variant="outline" onClick={verify}>Verify launch readiness</Button>
        {!wallet.connected ? <Button disabled={busy} onClick={connect}>Connect Phantom</Button> : <Button disabled={busy} variant="outline" onClick={disconnect}>Disconnect wallet</Button>}</div>
      {wallet.installed === false && <p className="text-xs text-muted-foreground">Use the Phantom browser extension, or open Kydos in the Phantom mobile app browser.</p>}
    </section>
    <nav className="flex gap-2" aria-label="DBC workspace mode">
      <Button disabled={busy} variant={mode === 'create' ? 'default' : 'outline'} onClick={() => setMode('create')}>Create token</Button>
      <Button disabled={busy} variant={mode === 'fees' ? 'default' : 'outline'} onClick={() => setMode('fees')}>Manage launch and fees</Button>
    </nav>
    {mode === 'create' ? <form className={panel} onSubmit={event => { event.preventDefault(); if (!review && !result) prepare('create'); }}>
      <h2 className="text-lg font-semibold">Token details</h2>
      {['name', 'symbol'].map(key => <label key={key} className="block space-y-2 text-sm" htmlFor={`dbc-${key}`}>
        <span>{key === 'name' ? 'Token name' : 'Ticker'}</span>
        <Input id={`dbc-${key}`} value={form[key]} required disabled={busy || !!review || !!result} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))}/>
      </label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.manualMetadata} disabled={busy || !!review || !!result} onChange={event => setForm(previous => ({ ...previous, manualMetadata: event.target.checked }))}/>Use an existing metadata URI</label>
      {form.manualMetadata ? <label className="block space-y-2 text-sm" htmlFor="dbc-metadataUri"><span>Metadata URI (HTTPS, IPFS or Arweave)</span>
        <Input id="dbc-metadataUri" value={form.metadataUri} required disabled={busy || !!review || !!result} onChange={event => setForm(previous => ({ ...previous, metadataUri: event.target.value }))}/>
      </label> : <div className="space-y-4">
        <label className="block space-y-2 text-sm" htmlFor="dbc-description"><span>Description</span><textarea id="dbc-description" className="min-h-24 w-full rounded-md border border-input bg-background p-3" value={form.description} disabled={busy || !!review || !!result} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))}/></label>
        <label className="block space-y-2 text-sm" htmlFor="dbc-image"><span>Token image (PNG, JPG or WebP, up to 5 MB)</span><Input id="dbc-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !!review || !!result} onChange={chooseImage}/></label>
        {imagePreview && <div className="flex items-center gap-4"><img src={imagePreview} alt="Selected token artwork" className="h-24 w-24 rounded-xl object-cover"/><p className="min-w-0 break-all text-xs text-muted-foreground">{file.name}</p></div>}
        <p className="text-xs text-muted-foreground">Review uploads the image and metadata publicly to IPFS before requesting wallet approval. Files are not removed if you cancel the launch.</p>
        {!auth.isAuthenticated && <p className="text-sm"><Link to="/login" className="underline">Sign in to upload artwork</Link>, or use an existing metadata URI without signing in. Phantom connection and website sign-in are separate.</p>}
      </div>}
      <p className="text-xs text-muted-foreground">1B initial supply: 793.1M nominal curve allocation and 206.9M migration allocation. Creation only; no initial purchase is added or charged.</p>
      {!review && !result && <Button type="submit" disabled={blocked || (!form.manualMetadata && (!file || !auth.isAuthenticated))}>Review token launch</Button>}
    </form> : <section className={panel}>
      <h2 className="text-lg font-semibold">Manage a registered DBC launch</h2>
      <label className="block space-y-2 text-sm" htmlFor="dbc-mint"><span>Token mint</span><Input id="dbc-mint" value={mint} disabled={busy || !!review} onChange={event => setMint(event.target.value)}/></label>
      <Button disabled={busy || !!configError || !mint.trim()} variant="outline" onClick={load}>Read launch and positions</Button>
      {record && <div className="space-y-3 text-sm">
        <p>Stage: <strong>{record.stage}</strong></p>
        <p className="break-all">Original creator: <span className="font-mono text-xs">{record.creator.toBase58()}</span></p>
        <p>Base burned: {formatDbcAmount(record.baseBurned, 6)} tokens</p>
        <p>Creator paid: {formatDbcAmount(record.creatorQuotePaid)} WSOL</p>
        <p>Kydos post-migration revenue: {formatDbcAmount(record.kydosQuotePaid)} WSOL</p>
        <p>Kydos bonding revenue: {formatDbcAmount(record.bondingQuotePaid)} WSOL</p>
        <a className="inline-block underline" href={dbcExplorerUrl('token', record.mint, configured.release.genesisHash)} target="_blank" rel="noreferrer">View token on {networkName}</a>
        <p className="text-xs text-muted-foreground">Settlement burns newly claimed base and pays net quote 50/50. The caller separately sponsors rent and network fees. Payouts remain WSOL; no existing wallet balance is unwrapped or swept.</p>
        {positions.map(position => <div key={position.nft} className="space-y-2 border-t border-border pt-3">
          <p className="break-all font-mono text-xs">Locked position: {position.position}</p>
          <Button disabled={blocked || !!review} onClick={() => prepare('settle', position.nft)}>Review 50/50 settlement and burn</Button>
        </div>)}
        {record.stage === 'migrated' && positions.length === 0 && <p role="status">No qualifying Kydos-custodied position found. Settlement is unavailable.</p>}
        {record.stage !== 'migrated' && <p role="status">Post-migration settlement becomes available after verified graduation. Trading and graduation are not executed by this launch form.</p>}
        <details><summary>Bonding-phase fees</summary><p className="my-2 text-xs">These historical partner fees go only to Kydos, including claims after graduation. They are not creator revenue.</p>
          <Button disabled={blocked || !!review} variant="outline" onClick={() => prepare('bonding')}>Review Kydos bonding-fee collection</Button></details>
      </div>}
    </section>}
    {!result && <section className={panel}><label className="flex flex-wrap items-center justify-between gap-3 text-sm" htmlFor="dbc-priority"><span>Transaction priority price</span>
      <select id="dbc-priority" className="rounded-md border border-input bg-background p-2" value={priority} disabled={busy || !!review} onChange={event => setPriority(event.target.value)}>
        <option value="0">No priority fee</option><option value="10000">10,000 micro-lamports / CU</option><option value="100000">100,000 micro-lamports / CU</option><option value="1000000">1,000,000 micro-lamports / CU (cap)</option>
      </select></label><p className="text-xs text-muted-foreground">The exact SOL charge is shown in review. A higher priority fee does not guarantee inclusion. It is paid from your wallet, never from anticipated rewards.</p></section>}
    {review && <section className={panel} aria-label="Review DBC transaction">
      <h2 className="text-lg font-semibold">Review on {networkName}</h2>
      <p className="break-all text-xs">Mint: {review.mint}</p><p className="break-all text-xs">Original creator: {review.creator}</p><p className="break-all text-xs">Kydos treasury: {review.treasury}</p>
      {review.metadataUri && <p className="break-all text-xs">Metadata: {review.metadataUri}</p>}
      {review.preview && <div className="text-sm"><p>Simulated base burn: {formatDbcAmount(review.preview.baseBurned, 6)} tokens</p><p>Simulated creator payout: {formatDbcAmount(review.preview.creatorQuote)} WSOL</p><p>Simulated Kydos payout: {formatDbcAmount(review.preview.kydosQuote)} WSOL</p></div>}
      <dl className="space-y-1 text-sm">
        {[['Network fee (includes priority)', review.costs.networkFeeLamports], ['Priority portion (already included)', review.costs.priorityFeeLamports], ['Account rent budget', review.costs.rentLamports], ['Metadata creation fee', review.costs.metadataFeeLamports], ['Total estimated SOL needed', review.costs.requiredLamports]]
          .map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd>{formatDbcAmount(amount)} SOL</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">Simulated again before signing. Claimable amounts can change with trading. Unused rent stays in your wallet. A higher budget requires another review. Network fees may still be charged if execution fails.</p>
      {isMainnet && <label className="flex items-start gap-3 rounded-lg border border-primary/40 p-3 text-sm"><input className="mt-1" type="checkbox" checked={mainnetAcknowledged} disabled={busy} onChange={event => setMainnetAcknowledged(event.target.checked)}/><span>I understand this is Solana mainnet and uses real SOL. I have checked the token details, creator, recipients and total cost.</span></label>}
      <div className="flex flex-wrap gap-3"><Button disabled={busy} variant="outline" onClick={edit}>Edit / cancel review</Button><Button disabled={blocked || (isMainnet && !mainnetAcknowledged)} onClick={submit}>{review.operation === 'create' ? 'Launch token with Phantom' : 'Approve fee transaction with Phantom'}</Button></div>
    </section>}
    {busy && <p role="status">{stageText[phase] || 'Checking...'}</p>}
    {blockedReason && !configError && !busy && <p role="status" className="text-sm text-muted-foreground">{blockedReason}</p>}
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
    {result && <section className={panel} role="status"><h2 className="font-semibold">{result.operation === 'create' ? 'Token launched' : 'Transaction confirmed'} on {dbcNetwork(result.chain).name}</h2>
      <p className="break-all font-mono text-xs">Token: {result.mint}</p><p className="break-all font-mono text-xs">Signature: {result.signature}</p>
      <div className="flex flex-wrap gap-3"><Button asChild><Link to={dbcLaunchUrl(result.mint, result.chain)}>Open launch</Link></Button><Button variant="outline" onClick={() => copyMint(result.mint)}>{copied ? 'Copied' : 'Copy token address'}</Button><Button variant="outline" asChild><a href={dbcExplorerUrl('tx', result.signature, result.chain)} target="_blank" rel="noreferrer">View transaction</a></Button></div>
      {result.operation === 'create' && <Button variant="outline" onClick={() => { setForm(emptyForm); setFile(null); setResult(null); setFileVersion(value => value + 1); }}>Create another token</Button>}
    </section>}
    {launches.length > 0 && <section className={panel} aria-label="Your launches"><h2 className="font-semibold">Your confirmed launches in this browser</h2><p className="text-xs text-muted-foreground">Current wallet and network only. This is local transaction history, not the public market index.</p>
      {launches.slice(-10).reverse().map(item => <Link key={item.id} className="block break-all text-xs underline" to={dbcLaunchUrl(item.metadata.mint, item.scope.chain)}>{item.metadata.mint}</Link>)}
    </section>}
    <Activity activity={activity} connection={connection}/>
  </main>;
}
