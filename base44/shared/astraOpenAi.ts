const maxRetries = 4;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export function resolveModel(value) { return String(value || '').trim() || 'gpt-4.1'; }
export async function callOpenAi({ apiKey, model, messages, tools, responseFormat }) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, ...(tools?.length ? { tools, tool_choice: 'auto', parallel_tool_calls: false, reasoning_effort: 'xhigh' } : {}), ...(responseFormat ? { response_format: responseFormat } : {}) })
    });
    if (response.ok) return (await response.json()).choices[0].message;
    const body = await response.json().catch(() => ({}));
    const detail = body.error?.message || `OpenAI ${response.status}`;
    if (response.status !== 429 || attempt >= maxRetries) throw new Error(detail);
    await wait(1000 * 2 ** attempt);
  }
}