import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { validateTrainingExample } from '../../shared/astraTraining.ts';
import { safeAstraError } from '../../shared/astraOpenAi.ts';
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req), user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json(), offset = Number(input.offset || 0), limit = Number(input.limit || 5);
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 5) return Response.json({ error: 'Use a nonnegative offset and a page size from 1 to 5.' }, { status: 400 });
    const cutoff = input.cutoff || new Date().toISOString();
    if (!Number.isFinite(Date.parse(cutoff))) return Response.json({ error: 'Invalid export cutoff.' }, { status: 400 });
    // Scan actual user turns so older conversations without a directory record are not silently omitted.
    const candidates = await base44.entities.AstraMessage.filter({ role: 'user', created_date: { $lte: cutoff } }, 'created_date', limit + 1, offset);
    const examples = [], skipped = [], seen = new Set();
    for (const prompt of candidates.slice(0, limit)) {
      const key = `${prompt.conversationId}:${prompt.requestId || prompt.id}`;
      if (seen.has(key)) continue; seen.add(key);
      const directory = await base44.entities.AstraConversation.filter({ conversationId: prompt.conversationId }, '-created_date', 1);
      if (directory[0]?.deleted) { skipped.push({ key, reason: 'Deleted conversation.' }); continue; }
      if (!prompt.requestId) { skipped.push({ key, reason: 'Legacy turn without a request identity.' }); continue; }
      const rows = await base44.entities.AstraMessage.filter({ conversationId: prompt.conversationId, requestId: prompt.requestId }, 'created_date', 500);
      const reply = rows.find(row => row.role === 'assistant' && row.status === 'completed');
      if (!reply?.trace_uri || prompt.status !== 'completed') { skipped.push({ key, reason: 'Incomplete turn or no authentic full transcript; tool calls cannot be reconstructed from activity labels.' }); continue; }
      try {
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: reply.trace_uri, expires_in: 60 });
        const response = await fetch(signed.signed_url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!response.ok) throw new Error('Private transcript could not be read.');
        const reader = response.body.getReader(); let length = 0, text = ''; const decoder = new TextDecoder();
        while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 800000) { await reader.cancel(); throw new Error('Transcript exceeds export limit.'); } text += decoder.decode(value, { stream: true }); }
        text += decoder.decode(); const trace = JSON.parse(text);
        if (trace.conversationId !== prompt.conversationId || trace.requestId !== prompt.requestId || trace.hadErrors) throw new Error('Trace identity mismatch or a failed tool operation.');
        if (/time (?:limit|budget)|execution limit|No response was returned/i.test(reply.content)) throw new Error('Limit/error reply excluded.');
        const example = validateTrainingExample(trace.example);
        examples.push({ key, conversationId: prompt.conversationId, requestId: prompt.requestId, model: trace.model, promptVersion: trace.promptVersion, example });
      } catch (error) { skipped.push({ key, reason: safeAstraError(error) }); }
    }
    return Response.json({ examples, skipped, cutoff, next_offset: candidates.length > limit ? offset + limit : null, format: 'OpenAI supervised fine-tuning chat messages JSONL; not raw Responses input/output items.', requires_review: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: safeAstraError(error) }, { status: 500 }); }
}