import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const empty = { title: '', source_repo: '', summary: '', keywords: '', content: '' };
export default function AstraReferenceForm({ reference, content, busy, onSave, onCancel }) {
  const [form, setForm] = useState(empty);
  useEffect(() => setForm(reference ? { ...reference, keywords: (reference.keywords || []).join(', '), content: content || '' } : empty), [reference, content]);
  const change = event => setForm(value => ({ ...value, [event.target.name]: event.target.value }));
  const submit = async event => { event.preventDefault(); await onSave({ ...form, id: reference?.id, uid: reference?.uid, created_at: reference?.created_at }); if (!reference) setForm(empty); };
  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-4">
    <div><h2 className="font-semibold">{reference ? 'Edit reference' : 'Add reference'}</h2><p className="text-sm text-muted-foreground">Paste protocol documentation for Astra to search and read.</p></div>
    <Field label="Title"><Input name="title" value={form.title} onChange={change} required placeholder="Pons protocol architecture" /></Field>
    <Field label="Source repository"><Input name="source_repo" value={form.source_repo} onChange={change} placeholder="ponsdotdev/pons-labs" /></Field>
    <Field label="Summary"><Textarea name="summary" value={form.summary} onChange={change} required rows={3} placeholder="What this reference covers" /></Field>
    <Field label="Keywords"><Input name="keywords" value={form.keywords} onChange={change} placeholder="hooks, pools, liquidity" /></Field>
    <Field label="Full documentation"><Textarea name="content" value={form.content} onChange={change} required rows={10} className="font-mono text-xs" placeholder="Paste README, contract spec, or implementation notes" /></Field>
    <div className="flex gap-2"><Button disabled={busy}>{busy ? 'Saving…' : 'Save reference'}</Button>{reference && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}</div>
  </form>;
}
function Field({ label, children }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }