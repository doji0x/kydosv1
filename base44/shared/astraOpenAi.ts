const maxAttempts = 6;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export function resolveModel(value) { return String(value || '').trim() || 'gpt-6-astra'; }
export function resolveToolsModel(value) { return resolveModel(value); }
function normalizeResponse(data) {
  const output = data.output || [];
  const content = data.output_text || output.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join('\n');
  const toolCalls = output.filter(item => item.type === 'function_call').map(item => ({ id: item.call_id || item.id, type: 'function', function: { name: item.name, arguments: item.arguments || '{}' } }));
  return { role: 'assistant', content, tool_calls: toolCalls };
}
function responsesInput(messages) {
  return messages.flatMap(message => {
    if (message.role === 'tool') return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }];
    const items = message.content ? [{ role: message.role, content: message.content }] : [];
    return items.concat((message.tool_calls || []).map(call => ({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments || '{}' })));
  });
}
function responsesTools(tools = []) {
  return tools.map(tool => ({ type: 'function', name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters }));
}
export async function callOpenAi({ apiKey, model, messages, tools, responseFormat }) {
  const payload = { model, input: responsesInput(messages), ...(tools?.length ? { tools: responsesTools(tools), tool_choice: 'auto', parallel_tool_calls: false } : {}), ...(responseFormat ? { text: { format: responseFormat } } : {}) };
  const body = JSON.stringify(payload);
  if (body.length > 800000) throw new Error('Astra model payload exceeds the 800,000-character safety limit; continue from a compact checkpoint.');
  for (let attempt = 0; ; attempt++) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body
    });
    if (response.ok) return normalizeResponse(await response.json());
    const errorBody = await response.json().catch(() => ({}));
    const detail = errorBody.error?.message || `OpenAI ${response.status}`;
    if (response.status !== 429 || attempt >= maxAttempts - 1) throw new Error(detail);
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0 ? retryAfterSeconds * 1000 : 0;
    await wait(Math.max(retryAfterMs, 1000 * 2 ** attempt));
  }
}