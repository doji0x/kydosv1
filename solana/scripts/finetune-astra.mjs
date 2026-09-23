import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2), get = name => args[args.indexOf(name) + 1];
const supported = new Set(['gpt-4.1-2025-04-14', 'gpt-4.1-mini-2025-04-14', 'gpt-4.1-nano-2025-04-14']);
const key = process.env.ASTRA_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const training = args.includes('--training') ? get('--training') : '', validation = args.includes('--validation') ? get('--validation') : '';
const model = args.includes('--model') ? get('--model') : '', resume = args.includes('--job') ? get('--job') : '';
if (!key) throw new Error('Set ASTRA_OPENAI_API_KEY locally. Never paste it into chat or commit it.');
async function api(path, options = {}) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, { ...options, headers: { Authorization: `Bearer ${key}`, ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, signal: AbortSignal.timeout(60000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || `Provider returned ${response.status}.`); return data;
}
function validate(text) {
  const lines = text.trim().split('\n').filter(Boolean), hashes = new Set();
  for (const line of lines) {
    const row = JSON.parse(line); if (!Array.isArray(row.messages) || row.messages.at(-1)?.role !== 'assistant') throw new Error('Every example must use messages format and end with an assistant reply.');
    if (/(?:sk-(?:proj-)?[\w-]{16,}|ghp_[\w]{16,}|github_pat_[\w]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+\S{20,}|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b)/i.test(line)) throw new Error('Potential credentials or personal data in the dataset; redact before upload.');
    const pending = new Set();
    for (const message of row.messages) {
      if (message.role === 'tool') { if (!pending.delete(message.tool_call_id)) throw new Error('Unpaired tool result.'); }
      else { if (pending.size) throw new Error('Missing tool output.'); for (const call of message.tool_calls || []) { JSON.parse(call.function.arguments); pending.add(call.id); } }
    }
    if (pending.size) throw new Error('Incomplete tool sequence.');
    const hash = createHash('sha256').update(JSON.stringify(row)).digest('hex'); if (hashes.has(hash)) throw new Error('Duplicate training example.'); hashes.add(hash);
  }
  return { count: lines.length, hashes };
}
let jobId = resume;
if (!jobId) {
  if (!training || !validation || !supported.has(model)) throw new Error('Provide --training FILE --validation FILE --model SUPPORTED_SFT_MODEL. GPT-6 Astra is not listed as SFT-supported; your live chat model will NOT be changed.');
  const trainText = await readFile(training, 'utf8'), validationText = await readFile(validation, 'utf8');
  const train = validate(trainText), holdout = validate(validationText);
  if (train.count < 10 || holdout.count < 1) throw new Error('Need at least 10 reviewed training examples and a nonempty validation set; 50+ training examples recommended.');
  if ([...holdout.hashes].some(hash => train.hashes.has(hash))) throw new Error('Training/validation leakage: duplicate examples. Split whole conversations, not individual turns.');
  if (!args.includes('--approve-upload-and-cost')) throw new Error('Validation passed. Review data, rights, account eligibility and pricing, then add --approve-upload-and-cost to authorize private-data upload and paid training.');
  // Existing fine-tuning account required. This read fails before upload if access is unavailable.
  await api('fine_tuning/jobs?limit=1');
  async function upload(text, name) { const form = new FormData(); form.set('purpose', 'fine-tune'); form.set('file', new Blob([text], { type: 'application/jsonl' }), name); return (await api('files', { method: 'POST', body: form })).id; }
  const training_file = await upload(trainText, 'astra-training.jsonl'), validation_file = await upload(validationText, 'astra-validation.jsonl');
  await mkdir('astra-training', { recursive: true, mode: 0o700 });
  await writeFile(`astra-training/upload-${Date.now()}.json`, JSON.stringify({ training_file, validation_file, model }), { mode: 0o600 });
  // Do not automatically retry creation: an ambiguous response may already have started a paid job.
  const job = await api('fine_tuning/jobs', { method: 'POST', body: JSON.stringify({ model, training_file, validation_file, suffix: 'astra', method: { type: 'supervised' } }) });
  jobId = job.id;
  await writeFile(`astra-training/${jobId}.json`, JSON.stringify({ jobId, model, training_file, validation_file }), { mode: 0o600 });
  console.log(`Training job ${jobId}. Resume monitoring without starting another job: --job ${jobId}`);
}
if (!/^ftjob-[\w-]+$/.test(jobId)) throw new Error('Invalid training job ID.');
for (;;) {
  const job = await api(`fine_tuning/jobs/${encodeURIComponent(jobId)}`); console.log(`${jobId}: ${job.status}`);
  if (job.status === 'succeeded') { console.log(`Candidate model: ${job.fine_tuned_model}\nEvaluate Responses API tool use and JSON replies before setting ASTRA_FINETUNED_MODEL. Production was not changed.`); break; }
  if (['failed','cancelled'].includes(job.status)) throw new Error(job.error?.message || `Training ${job.status}.`);
  await new Promise(resolve => setTimeout(resolve, 30000));
}