const maxRetries = 4;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export function resolveModel(value) { return String(value || '').trim() || 'gpt-4.1'; }
function normalizeResponse(data) {
  const content = data.output_text || (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join('\n');
  return { role: 'assistant', content, tool_calls: [] };
}
export async function callOpenAi({ apiKey, model, messages, tools, responseFormat }) {
  const usesTools = Boolean(tools?.length);
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(usesTools ? 'https://api.openai.com/v1/chat/completions' : 'https://api.openai.com/v1/responses', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(usesTools
        ? { model, messages, tools, tool_choice: 'auto', parallel_tool_calls: false, ...(responseFormat ? { response_format: responseFormat } : {}) }
        : { model, input: messages, ...(responseFormat ? { text: { format: responseFormat } } : {}) })
    });
    if (response.ok) { const data = await response.json(); return usesTools ? data.choices[0].message : normalizeResponse(data); }
    const body = await response.json().catch(() => ({}));
    const detail = body.error?.message || `OpenAI ${response.status}`;
    if (response.status !== 429 || attempt >= maxRetries) throw new Error(detail);
    await wait(1000 * 2 ** attempt);
  }
}