export const REQUEST_LIFETIME_MS = 270000;
export async function requestState(base44, conversationId, requestId) {
  const rows = await base44.entities.AstraMessage.filter({ conversationId, requestId }, 'created_date', 500);
  const assistant = rows.find(x => x.role === 'assistant');
  if (assistant) return { state: assistant.status === 'failed' ? 'failed' : 'completed', reply: assistant.content };
  const user = rows.find(x => x.role === 'user');
  const stop = rows.find(x => x.toolName === 'requestControl' && x.status === 'failed');
  if (stop) return { state: 'failed', reply: stop.content };
  if (!user) return { state: 'unknown' };
  if (user.status === 'failed') return { state: 'failed', reply: rows.filter(x => x.status === 'failed').at(-1)?.content || 'Request stopped. Review activity before retrying.' };
  if (Date.now() - new Date(user.created_date).getTime() > REQUEST_LIFETIME_MS) {
    await base44.entities.AstraMessage.update(user.id, { status: 'failed' });
    return { state: 'failed', reply: 'No completion was confirmed within the processing window. Review saved activity before retrying.' };
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
  if (user?.status === 'running') await base44.entities.AstraMessage.update(user.id, { status: 'failed' });
  return { state: 'failed', reply: 'Stop requested. An operation already in progress may still complete.' };
}