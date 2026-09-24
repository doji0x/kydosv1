import { ASTRA_LIMITS } from '../../shared/astraLimits.ts';
import { persistRequestFailure } from '../../shared/astraRequestFailure.ts';
export const REQUEST_LIFETIME_MS = ASTRA_LIMITS.turnMs;
export function requestStartedAt(user) {
  const value = String(user.created_date || '');
  // Base44 timestamps without an explicit zone are UTC, not the browser's local time.
  return Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}
export async function requestState(base44, conversationId, requestId) {
  const rows = await base44.entities.AstraMessage.filter({ conversationId, requestId }, 'created_date', 500);
  const assistant = rows.find(x => x.role === 'assistant');
  if (assistant) return { state: assistant.status === 'failed' ? 'failed' : 'completed', reply: assistant.content };
  const user = rows.find(x => x.role === 'user');
  const stop = rows.find(x => x.toolName === 'requestControl' && x.status === 'failed');
  if (stop) return { state: 'failed', reply: stop.content };
  const failure = rows.find(x => x.toolName === 'request' && x.status === 'failed');
  if (!user) return failure ? { state: 'failed', reply: failure.content } : { state: 'unknown' };
  if (failure || user.status === 'failed') {
    const reply = failure?.content || 'Request stopped without a completed reply. Review saved activity before retrying.';
    if (!failure || user.status !== 'failed') await persistRequestFailure(base44, user, reply, !!failure);
    return { state: 'failed', reply };
  }
  const startedAt = requestStartedAt(user);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt >= REQUEST_LIFETIME_MS) {
    const reply = 'Astra exceeded its 270-second processing window without a saved reply. The request may have been interrupted; review saved activity before retrying.';
    await persistRequestFailure(base44, user, reply);
    return { state: 'failed', reply };
  }
  return { state: 'running' };
}
export async function cancelRequest(base44, conversationId, requestId) {
  const rows = await base44.entities.AstraMessage.filter({ conversationId, requestId }, '-created_date', 500);
  const reply = rows.find(x => x.role === 'assistant');
  if (reply) return { state: reply.status === 'failed' ? 'failed' : 'completed', reply: reply.content };
  const user = rows.find(x => x.role === 'user');
  // Persist a stop even if the original request has not created its user message yet.
  await base44.entities.AstraMessage.create({ conversationId, requestId, role: 'activity', toolName: 'requestControl', status: 'failed', content: 'Stop requested. No further tools will start after the current operation finishes; completed commits are not undone.' });
  if (user) await base44.entities.AstraMessage.update(user.id, { status: 'failed' });
  return { state: 'failed', reply: 'Stop requested. An operation already in progress may still complete.' };
}