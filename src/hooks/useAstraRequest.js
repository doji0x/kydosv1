import { useCallback, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
export default function useAstraRequest() {
  const run = useRef(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const finish = useCallback((requestId, failure = '') => {
    if (run.current?.requestId !== requestId) return;
    localStorage.removeItem(`astra-pending:${run.current.conversationId}`); run.current = null; setBusy(false); setNotice(''); setError(failure);
  }, []);
  const start = useCallback((value) => { run.current = value; localStorage.setItem(`astra-pending:${value.conversationId}`, JSON.stringify(value)); setBusy(true); setNotice(''); setError(''); }, []);
  const reconcile = useCallback(rows => {
    const pending = run.current; if (!pending) return;
    const matching = rows.filter(x => x.requestId === pending.requestId);
    const reply = matching.find(x => x.role === 'assistant');
    if (reply) finish(pending.requestId, reply.status === 'failed' ? reply.content : '');
    else if (matching.some(x => x.role === 'user' && x.status === 'failed')) finish(pending.requestId, matching.filter(x => x.status === 'failed' && x.role === 'activity').at(-1)?.content || 'Request stopped. Review activity before retrying.');
  }, [finish]);
  const check = useCallback(async () => {
    const pending = run.current; if (!pending) return;
    try { const { data } = await base44.functions.invoke('astraChat', { ...pending, action: 'status' });
      if (['completed','failed'].includes(data.state)) finish(pending.requestId, data.state === 'failed' ? data.reply : '');
      else if (Date.now() - pending.startedAt > 300000) finish(pending.requestId, 'No completion could be confirmed. Review saved activity before retrying.');
    } catch { if (Date.now() - pending.startedAt > 300000) finish(pending.requestId, 'Connection lost. Reopen this chat to check saved activity before retrying.'); }
  }, [finish]);
  const cancel = useCallback(async () => {
    const pending = run.current; if (!pending) return;
    setNotice('Stopping after the current operation…');
    try { const { data } = await base44.functions.invoke('astraChat', { ...pending, action: 'cancel' }); finish(pending.requestId, data.state === 'completed' ? '' : data.reply); }
    catch { setNotice('Could not confirm the stop request; still checking for completion.'); }
  }, [finish]);
  return { run, busy, notice, error, setError, setNotice, start, finish, reconcile, check, cancel };
}