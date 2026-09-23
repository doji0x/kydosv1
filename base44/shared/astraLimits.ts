export const ASTRA_LIMITS = { message: 60000, toolOutput: 24000, event: 500, contextTokens: 60000, turnMs: 230000, maxOutputTokens: 16000 };
export const estimateTokens = value => Math.ceil(String(value || '').length / 3);
export function compactForModel(content, artifactRef, limit = ASTRA_LIMITS.message, budget) {
  const value = String(content || '');
  const allowed = Math.max(0, Math.min(limit, budget ? budget.remaining * 3 : limit));
  const marker = '\n[Content shortened; reread the original before relying on omitted details.]';
  const text = value.length <= allowed ? value : (allowed > marker.length ? value.slice(0, allowed - marker.length) + marker : '');
  const estimatedTokens = estimateTokens(text);
  if (budget) budget.remaining = Math.max(0, budget.remaining - estimatedTokens);
  return { content: text, estimatedTokens, artifactRefs: value.length > allowed ? [artifactRef] : [] };
}