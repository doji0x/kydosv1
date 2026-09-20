import { BookOpen, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AstraReferenceRow({ reference, busy, onEdit, onDelete }) {
  return <article className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><BookOpen className="h-4 w-4" /></div><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{reference.title}</h3><p className="truncate font-mono text-xs text-muted-foreground">{reference.source_repo || 'Manual reference'}</p></div></div>
    <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{reference.summary}</p>
    {!!reference.keywords?.length && <div className="mt-3 flex flex-wrap gap-1">{reference.keywords.map(word => <span key={word} className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">{word}</span>)}</div>}
    <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={onEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="text-destructive"><Trash2 className="h-3.5 w-3.5" />Delete</Button></div>
  </article>;
}