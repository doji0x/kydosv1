import { ASTRA_LIMITS, estimateTokens } from './astraLimits.ts';
import { beforeDeadline } from './astraDeadline.ts';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export function resolveModel(value) {
  // Fine-tuned and alternative overrides are intentionally disabled until verified.
  return String(value || '').trim() === 'gpt-6-astra' ? String(value).trim() : 'gpt-6-astra';
}
export function resolveToolsModel(value) { return String(value || '').trim() || 'xhigh'; }
export function resolveReasoning(value) { return ['low','medium','high','xhigh','max'].includes(value) ? value : 'medium'; }
export function safeAstraError(error) {
  return String(error?.message || error || 'Astra could not complete this request.').replace(/(?:sk-|ghp_|github_pat_)[\w-]+/g, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/https?:\/\/[^\s]+/g, '[service URL]').slice(0, 1500);
}
function normalizeResponse(data) {
  if (data.status === 'incomplete') throw new Error(`Model response was incomplete (${data.incomplete_details?.reason || 'output limit'}). Try a smaller request.`);
  if (data.error || data.status === 'failed') throw new Error(data.error?.message || 'Model request failed.');
  const output = data.output || [];
  const refusal = output.flatMap(item => item.content || []).find(item => item.type === 'refusal');
  if (refusal) throw new Error(refusal.refusal || 'The model declined this request.');
  const content = data.output_text || output.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join('\n');
  const tool_calls = output.filter(item => item.type === 'function_call').map(item => ({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments || '{}' } }));
  return { role: 'assistant', content, tool_calls, responseItems: output };
}
export function responsesInput(messages) {
  return messages.flatMap(message => {
    // Replay native output items, including encrypted reasoning, unchanged within this turn.
    if (message.responseItems) return message.responseItems;
    if (message.role === 'tool') return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }];
    const items = message.content ? [{ role: message.role === 'system' ? 'developer' : message.role, content: message.content }] : [];
    return items.concat((message.tool_calls || []).map(call => ({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments || '{}' })));
  });
}
export async function callOpenAi({ apiKey, model, messages, tools, responseFormat, reasoningEffort = 'medium', deadline = Date.now() + ASTRA_LIMITS.turnMs }) {
  const reasoningModel = /^(gpt-[56]|o[134])/.test(model) || /^ft:(gpt-[56]|o[134])/.test(model);
  const payload = { model, store: false, max_output_tokens: ASTRA_LIMITS.maxOutputTokens,
    input: responsesInput(messages), ...(reasoningModel ? { reasoning: { effort: resolveReasoning(reasoningEffort) }, include: ['reasoning.encrypted_content'] } : {}),
    ...(tools?.length ? { tools: tools.map(({function: f}) => ({ type: 'function', name: f.name, description: f.description, parameters: f.parameters, strict: true })), tool_choice: 'auto', parallel_tool_calls: false } : {}),
    ...(responseFormat ? { text: { format: responseFormat } } : {}) };
  const body = JSON.stringify(payload);
  if (estimateTokens(body) > ASTRA_LIMITS.contextTokens || body.length > 700000) throw new Error('Astra reached its context budget. Saved activity is available; continue with a focused request.');
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) throw new Error('Astra reached its time budget. Saved activity is available; ask to continue.');
    const timeout = Math.min(90000, remaining);
    const timeoutMessage = `OpenAI response timed out after ${Math.ceil(timeout / 1000)} seconds. Review saved activity before retrying.`;
    let response, data;
    try {
      ({ response, data } = await beforeDeadline(async () => {
        const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(timeout) });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); }
        catch { throw new Error(`OpenAI HTTP ${response.status}: response was not valid JSON.`); }
        return { response, data };
      }, Date.now() + timeout, timeoutMessage));
    } catch (error) {
      if (['TimeoutError','AbortError'].includes(error?.name)) throw new Error(timeoutMessage);
      throw error;
    }
    if (response.ok) return normalizeResponse(data);
    const serviceError = `OpenAI HTTP ${response.status}${data.error?.code ? ` (${data.error.code})` : ''}: ${data.error?.message || 'Model request failed.'}`;
    if (![429,500,502,503,504].includes(response.status) || attempt === 2) throw new Error(serviceError);
    const delay = Math.max(1000 * 2 ** attempt, (Number(response.headers.get('retry-after')) || 0) * 1000);
    if (delay + 3000 > deadline - Date.now()) throw new Error(`${serviceError} No time remains for another attempt.`);
    await wait(delay);
  }
}