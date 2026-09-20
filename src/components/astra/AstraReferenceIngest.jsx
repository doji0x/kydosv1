import { useState } from 'react';
import { LoaderCircle, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AstraReferenceIngest({ busy, onIngest }) {
  const [url, setUrl] = useState('');
  const submit = async event => {
    event.preventDefault();
    await onIngest(url);
    setUrl('');
  };
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div>
      <h2 className="flex items-center gap-2 font-semibold"><LinkIcon className="h-4 w-4 text-primary" />Ingest link</h2>
      <p className="text-sm text-muted-foreground">Fetch a public raw text file and generate its reference details.</p>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input type="url" value={url} onChange={event => setUrl(event.target.value)} required disabled={busy} placeholder="https://raw.githubusercontent.com/…" aria-label="Public raw file URL" />
      <Button disabled={busy || !url.trim()} className="shrink-0">
        {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{busy ? 'Ingesting…' : 'Ingest'}
      </Button>
    </div>
  </form>;
}