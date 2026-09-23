import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
// Local administrator token only. Never commit tokens or datasets.
const url = 'https://kydos-launch-pad.base44.app/functions/exportAstraTrainingData';
const token = process.env.ASTRA_ADMIN_TOKEN;
if (!token) throw new Error('Set ASTRA_ADMIN_TOKEN to your authenticated administrator session token locally. Never paste it into chat.');
const directory = resolve(process.argv[2] || 'astra-training');
await mkdir(directory, { recursive: true, mode: 0o700 });
let offset = 0, cutoff; const examples = [], manifest = [], skipped = [], seen = new Set(), hashes = new Set();
do {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ offset, cutoff, limit: 5 }), signal: AbortSignal.timeout(120000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || `Export failed (${response.status}).`);
  cutoff = result.cutoff;
  for (const item of result.examples) {
    const encoded = JSON.stringify(item.example), hash = createHash('sha256').update(encoded).digest('hex');
    if (seen.has(item.key) || hashes.has(hash)) continue;
    seen.add(item.key); hashes.add(hash); examples.push(encoded); manifest.push({ line: examples.length, key: item.key, conversationId: item.conversationId, model: item.model, promptVersion: item.promptVersion, sha256: hash });
  }
  skipped.push(...result.skipped); offset = result.next_offset;
  console.log(`Collected ${examples.length} candidate examples; skipped ${skipped.length}.`);
} while (offset !== null);
await writeFile(resolve(directory, 'candidates.jsonl'), examples.join('\n') + (examples.length ? '\n' : ''), { mode: 0o600, flag: 'wx' });
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({ cutoff, manifest, skipped }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(`Saved ${examples.length} candidates to ${directory}. Nothing uploaded to the training provider. Review, redact and split by conversation before training.`);