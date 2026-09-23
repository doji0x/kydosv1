import React from 'react';
import { Button } from '@/components/ui/button';
export default function AstraRequestNotice({ busy, notice, onCancel }) {
  if (!busy && !notice) return null;
  return <div role="status" aria-live="polite" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary/80"><span>{notice || 'Astra is working…'}</span>{busy && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Stop</Button>}</div>;
}