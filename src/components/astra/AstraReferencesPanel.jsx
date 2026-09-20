import { useState } from 'react';
import AstraReferenceForm from './AstraReferenceForm';
import AstraReferenceRow from './AstraReferenceRow';
import useAstraReferences from '@/hooks/useAstraReferences';

export default function AstraReferencesPanel() {
  const library = useAstraReferences();
  const [editing, setEditing] = useState(null);
  const [content, setContent] = useState('');
  const edit = async reference => { setEditing(reference); setContent(''); setContent(await library.read(reference.id)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const save = async values => { await library.save(values); setEditing(null); setContent(''); };
  const remove = async reference => { if (window.confirm(`Delete “${reference.title}”?`)) await library.remove(reference.id); };
  return <div className="space-y-5">
    <AstraReferenceForm reference={editing} content={content} busy={library.busy} onSave={save} onCancel={() => { setEditing(null); setContent(''); }} />
    {library.error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{library.error}</p>}
    <section className="space-y-3"><div><h2 className="font-semibold">Reference library</h2><p className="text-sm text-muted-foreground">{library.references.length} stored document{library.references.length === 1 ? '' : 's'}</p></div>
      {library.loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading references…</p> : library.references.length ? library.references.map(reference => <AstraReferenceRow key={reference.id} reference={reference} busy={library.busy} onEdit={() => edit(reference)} onDelete={() => remove(reference)} />) : <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No references yet. Add the first protocol document above.</p>}
    </section>
  </div>;
}