import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

async function invokeReference(payload) {
  const { data } = await base44.functions.invoke('astraReference', payload);
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function useAstraReferences() {
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Entity pagination retains full summaries for the edit form. Do not edit a truncated tool summary.
      const rows = [], seen = new Set();
      let offset = 0;
      for (;;) {
        const page = await base44.entities.AstraReference.list('created_date', 100, offset);
        for (const row of page) {
          if (seen.has(row.id)) throw new Error('Library changed during enumeration; refresh and retry.');
          seen.add(row.id); rows.push(row);
        }
        if (page.length < 100) break;
        offset += page.length;
        if (offset >= 10000) throw new Error('Library exceeds UI enumeration limit; use paginated Astra tools.');
      }
      setReferences(rows);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  const operation = async fn => {
    setBusy(true); setError('');
    try { return await fn(); }
    catch (e) { setError(e.response?.data?.error || e.message); throw e; }
    finally { setBusy(false); }
  };
  const save = values => operation(async () => { await invokeReference({ action: values.id ? 'update' : 'create', ...values }); await load(); });
  const remove = id => operation(async () => { await invokeReference({ action: 'delete', id }); await load(); });
  const read = id => operation(async () => {
    let content = '', offset = 0, hash;
    for (;;) {
      const page = await invokeReference({ action: 'read', id, offset, expectedHash: hash });
      if (typeof page.content !== 'string' || page.offset !== offset || !page.content_sha256) throw new Error('Invalid reference page; no partial edit allowed.');
      hash = page.content_sha256;
      content += page.content;
      if (page.next_offset === null) {
        if (content.length !== page.total_chars) throw new Error('Incomplete document; no partial edit allowed.');
        return content;
      }
      if (page.next_offset <= offset || content.length > 500000) throw new Error('Invalid reference pagination.');
      offset = page.next_offset;
    }
  });
  const ingest = url => operation(async () => {
    const { data } = await base44.functions.invoke('ingestReference', { action: 'ingest', url });
    if (data?.error) throw new Error(data.error);
    await load();
  });
  return { references, loading, busy, error, save, remove, read, ingest };
}
