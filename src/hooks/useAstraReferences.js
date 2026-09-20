import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function useAstraReferences() {
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    const rows = await base44.entities.AstraReference.list('-updated_date', 100);
    setReferences(rows);
    setLoading(false);
  }, []);
  useEffect(() => { load().catch(e => { setError(e.message); setLoading(false); }); }, [load]);
  const invoke = async payload => {
    setBusy(true); setError('');
    try { const response = await base44.functions.invoke('astraReference', payload); return response.data; }
    catch (e) { setError(e.response?.data?.error || e.message); throw e; }
    finally { setBusy(false); }
  };
  const save = async values => { await invoke({ action: values.id ? 'update' : 'create', ...values }); await load(); };
  const remove = async id => { await invoke({ action: 'delete', id }); await load(); };
  const read = async id => (await invoke({ action: 'read', id })).content;
  const ingest = async url => { await invokeFunction('ingestReference', { action: 'ingest', url }); await load(); };
  const invokeFunction = async (name, payload) => {
    setBusy(true); setError('');
    try { const response = await base44.functions.invoke(name, payload); return response.data; }
    catch (e) { setError(e.response?.data?.error || e.message); throw e; }
    finally { setBusy(false); }
  };
  return { references, loading, busy, error, save, remove, read, ingest };
}