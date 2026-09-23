import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useAstraRequest from '@/hooks/useAstraRequest';
const key = 'astra-conversation-id';
export default function useAstraChat() {
  const [conversationId, setConversationId] = useState(() => new URLSearchParams(location.search).get('conversation') || localStorage.getItem(key) || crypto.randomUUID());
  const [messages, setMessages] = useState([]), [loading, setLoading] = useState(true), current = useRef(conversationId), revision = useRef(0);
  const { run, busy, notice, error, setError, setNotice, start, finish, reconcile, check, cancel } = useAstraRequest();
  const load = useCallback(async id => {
    const request = ++revision.current;
    const rows = await base44.entities.AstraMessage.filter({ conversationId: id }, '-created_date', 500);
    if (current.current !== id || revision.current !== request) return;
    const ordered = rows.reverse(); setMessages(ordered); reconcile(ordered); setLoading(false);
  }, [reconcile]);
  useEffect(() => {
    current.current = conversationId; localStorage.setItem(key, conversationId); setLoading(true); setError('');
    const saved = localStorage.getItem(`astra-pending:${conversationId}`);
    if (saved) { try { const pending = JSON.parse(saved); if (pending.requestId && pending.startedAt) start(pending); } catch { localStorage.removeItem(`astra-pending:${conversationId}`); } }
    const refresh = () => load(conversationId).catch(e => { if (current.current === conversationId) { setError(e.message); setLoading(false); } });
    refresh(); const off = base44.entities.AstraMessage.subscribe(e => { if (e.data?.conversationId === conversationId) refresh(); });
    return () => { off(); current.current = null; };
  }, [conversationId, load, start, setError]);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => { check().then(() => load(conversationId)).catch(() => {}); }, 10000); return () => clearInterval(timer); }, [busy, check, load, conversationId]);
  const send = text => {
    if (run.current || loading || !text.trim()) return false;
    const pending = { conversationId, requestId: crypto.randomUUID(), startedAt: Date.now() }; start(pending);
    setMessages(rows => [...rows, { id: `local-${pending.requestId}`, requestId: pending.requestId, role: 'user', content: text }]);
    base44.functions.invoke('astraChat', { ...pending, message: text }).then(async ({ data }) => {
      if (run.current?.requestId !== pending.requestId) return;
      if (data.state === 'failed') finish(pending.requestId, data.reply || data.error);
      else if (data.state === 'completed' || data.reply && !data.duplicate) finish(pending.requestId);
      else setNotice('Astra is still working…');
      await load(conversationId);
    }).catch(e => {
      if (run.current?.requestId !== pending.requestId) return;
      const status = e.response?.status;
      if (e.response?.data?.state === 'failed' || [400,401,403,409].includes(status)) finish(pending.requestId, e.response?.data?.error || e.message);
      else setNotice('Astra is still working… Checking for confirmation.');
    });
    return true;
  };
  const open = id => { if (run.current) return; current.current = id; setConversationId(id); setMessages([]); };
  return { conversationId, messages, busy, loading, error, notice, send, open, reset: () => open(crypto.randomUUID()), cancel };
}