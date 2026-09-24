import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
export default function useAstraRequest() {
  const run = useRef(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const finish = useCallback((requestId, failure = '') => {
    if (run.current?.requestId !== requestId) return;
    localStorage.removeItem(`astra-pending:${run.current.conversationId}`); run.current = null; setBusy(false); setNotice(''); setError(failure);
  }, []);
  const start = useCallback((value) => { run.current = value; localStorage.setItem(`astra-pending:${value.conversationId}`, JSON.stringify(value)); setBusy(true); setNotice(''); setError(''); }, []);
  useEffect(() => {
    if (!busy || !run.current) return;
    const pending = run.current;
    const timer = setTimeout(() => finish(pending.requestId, 'Astra exceeded its 270-second processing window without a confirmed reply. Review saved activity before retrying.'), Math.max(0, 270000 - (Date.now() - pending.startedAt)));
    return () => clearTimeout(timer);
  }, [busy, finish]);
  const reconcile = useCallback((rows, restore = false) => {
    if (!run.current && restore) {
      const user = rows.filter(x => x.role === 'user' && x.requestId).at(-1);
      if (user && !rows.some(x => x.requestId === user.requestId && x.role === 'assistant')) {
        const date = String(user.created_date || '');
        const startedAt = Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(date) ? date : `${date}Z`);
        start({ conversationId: user.conversationId, requestId: user.requestId, startedAt: Number.isFinite(startedAt) ? startedAt : 1 });
      }
    }
    const pending = run.current; if (!pending) return;
    const matching = rows.filter(x => x.requestId === pending.requestId);
    const reply = matching.find(x => x.role === 'assistant');
    if (reply) finish(pending.requestId, reply.status === 'failed' ? reply.content : '');
    else if (matching.some(x => x.status === 'failed' && (x.role === 'user' || ['request','requestControl'].includes(x.toolName)))) finish(pending.requestId, matching.filter(x => x.status === 'failed' && x.role === 'activity' && ['request','requestControl'].includes(x.toolName)).at(-1)?.content || 'Request stopped. Review activity before retrying.');
  }, [finish, start]);
  const check = useCallback(async () => {
    const pending = run.current; if (!pending) return;
    try { const { data } = await base44.functions.invoke('astraChat', { ...pending, action: 'status' });
      if (['completed','failed'].includes(data.state)) finish(pending.requestId, data.state === 'failed' ? data.reply || data.error || 'Astra could not complete this request.' : '');
      else if (Date.now() - pending.startedAt > 270000) finish(pending.requestId, 'No completion could be confirmed. Review saved activity before retrying.');
    } catch { if (Date.now() - pending.startedAt > 270000) finish(pending.requestId, 'Connection lost. Reopen this chat to check saved activity before retrying.'); }
  }, [finish]);
  const cancel = useCallback(async () => {
    const pending = run.current; if (!pending) return;
    setNotice('Stopping after the current operation…');
    try { const { data } = await base44.functions.invoke('astraChat', { ...pending, action: 'cancel' }); finish(pending.requestId, data.state === 'completed' ? '' : data.reply); }
    catch { setNotice('Could not confirm the stop request; still checking for completion.'); }
  }, [finish]);
  return { run, busy, notice, error, setError, setNotice, start, finish, reconcile, check, cancel };
}