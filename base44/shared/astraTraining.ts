// No internal reasoning is included in a training trace. Only model-visible messages and observable tool exchanges.
export const SENSITIVE_TRAINING_TEXT = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{20,}|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b)/i;
export function trainingMessages(history) {
  return history.map(m => ({ role: m.role === 'developer' ? 'system' : m.role, ...(m.content ? { content: m.content } : {}), ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}), ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}) }));
}
export function validateTrainingExample(example) {
  if (!Array.isArray(example.messages) || example.messages.at(-1)?.role !== 'assistant') throw new Error('Training example must end with an assistant reply.');
  const pending = new Set();
  for (const m of example.messages) {
    if (m.role === 'tool') { if (!pending.delete(m.tool_call_id)) throw new Error('Unpaired tool output.'); }
    else { if (pending.size) throw new Error('Missing tool results.'); for (const c of m.tool_calls || []) { JSON.parse(c.function.arguments); pending.add(c.id); } }
  }
  if (pending.size) throw new Error('Missing tool results.');
  const encoded = JSON.stringify(example);
  if (encoded.length > 180000) throw new Error('Example exceeds the review size limit.');
  if (SENSITIVE_TRAINING_TEXT.test(encoded)) throw new Error('Potential sensitive content; review locally rather than exporting automatically.');
  return example;
}
export async function saveTrainingTrace(base44, history, tools, metadata) {
  const example = validateTrainingExample({ messages: trainingMessages(history), tools, parallel_tool_calls: false });
  const file = new File([JSON.stringify({ version: 1, ...metadata, example })], `astra-${metadata.requestId}.json`, { type: 'application/json' });
  return (await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file })).file_uri;
}