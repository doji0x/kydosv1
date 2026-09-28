import React, { useState } from 'react';
import { browserActivity, unresolved } from '@/lib/solana/lifecycle';
import { Button } from '@/components/ui/button';

export default function JupiterTradeActivity({ activity, connection, onConfirmed }) {
  const [checking, setChecking] = useState(''), [error, setError] = useState('');
  const pending = activity.records.filter(unresolved), completed = activity.records.filter(record => !unresolved(record)).slice(-1);
  const reconcile = async record => {
    setChecking(record.id); setError('');
    try { const next = await browserActivity().reconcile(record.id, connection); if (next.state === 'confirmed') await onConfirmed(); }
    catch (failure) { setError(failure.message); }
    finally { setChecking(''); activity.refresh(); }
  };
  if (!activity.error && !error && !pending.length && !completed.length) return null;
  return <div className="space-y-3 border-t border-border pt-4 text-xs" aria-label="Swap activity">
    {(activity.error || error) && <p role="alert" className="text-destructive">{activity.error || error}</p>}
    {[...pending, ...completed].map(record => <div key={record.id} className="space-y-2">
      <p className="font-medium capitalize">{record.scope.operation}: {record.state}</p><p className="text-muted-foreground">{record.message}</p>
      {record.signature && <a className="block break-all text-primary underline" href={`https://solscan.io/tx/${record.signature}`} target="_blank" rel="noopener noreferrer">View transaction on Solscan</a>}
      {unresolved(record) && <><p className="text-muted-foreground">Trading is paused while this result is unresolved. Checking status never resubmits the trade.</p><Button type="button" size="sm" variant="outline" disabled={!!checking} onClick={() => reconcile(record)}>{checking === record.id ? 'Checking…' : 'Check transaction status'}</Button></>}
    </div>)}
  </div>;
}