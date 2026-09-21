import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { browserActivity, unresolved } from './lifecycle.js';
import { PROGRAM_ID } from './client.js';

export function useActivity(connection, wallet, conflict) {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [chain, setChain] = useState(null);
  const read = useCallback(() => {
    try { setRecords(browserActivity().read()); setError(''); }
    catch { setError('Recovery storage unavailable or invalid. Submission disabled. Do not clear storage to retry.'); }
  }, []);
  useEffect(() => {
    read();
    const changed = e => { if (e.type === 'solana-activity' || e.key === 'kydos.solana.activity.v1' || e.key === null) read(); };
    window.addEventListener('storage', changed);
    window.addEventListener('solana-activity', changed);
    return () => { window.removeEventListener('storage', changed); window.removeEventListener('solana-activity', changed); };
  }, [read]);
  useEffect(() => {
    let active = true; setChain(null);
    connection?.getGenesisHash().then(value => { if (active) setChain(value); }).catch(() => { if (active) setError('Chain identity unavailable; submission disabled'); });
    return () => { active = false; };
  }, [connection]);
  const scoped = records.filter(r => r.scope.wallet === wallet && r.scope.chain === chain && r.scope.program === PROGRAM_ID.toBase58());
  const pending = scoped.filter(r => unresolved(r) && r.scope.conflict === conflict);
  return { records, scoped, pending, error, chain, blocked: !!error || !chain || pending.length > 0 };
}

// Displays every original wallet/chain scope rather than deleting on wallet switch.
export function Activity({ activity, connection, onConfirmed }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const reconcile = async record => {
    setBusy(true); setError('');
    try {
      const next = await browserActivity().reconcile(record.id, connection);
      if (next.state === 'confirmed') await onConfirmed?.(next);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4" aria-label="Persistent Solana activity">
    <h2 className="font-semibold">Mainnet transaction activity</h2>
    <p className="text-xs text-muted-foreground">Recovery records stay in this browser across routes and tabs. Do not clear browser data while an outcome is unresolved. No transaction is retried automatically.</p>
    {(activity.error || error) && <p role="alert">{activity.error || error}</p>}
    {!activity.records.length && <p className="text-sm text-muted-foreground">No recorded operations.</p>}
    {[...activity.records].reverse().map(record => <article key={record.id} className="border-t border-border/60 pt-3 space-y-1 text-xs break-all">
      <p>{record.scope.operation}: {record.state}</p>
      <p>Wallet: {record.scope.wallet}</p><p>Chain: {record.scope.chain}</p><p>Program: {record.scope.program}</p>
      <p>Mint: {record.metadata.mint}</p>
      {record.signature && <p>Signature: {record.signature}</p>}
      <p>{record.message}</p>
      {record.evidence?.expired && <p>Blockhash expired; absent history does not release this lock.</p>}
      {unresolved(record) && <button type="button" className="underline" disabled={busy || !connection || record.scope.chain !== activity.chain} onClick={() => reconcile(record)}>Reconcile history (never resubmits)</button>}
      {record.state === 'confirmed' && record.scope.chain === activity.chain && <Link className="block underline" to={`/solana/${record.metadata.mint}`}>Open market</Link>}
    </article>)}
  </section>;
}