import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { fetchPublicDocument } from '../../shared/astraReferences.ts';

// Import is explicitly admin initiated. No LLM metadata generation or paid research call.
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    if (input.action !== 'ingest') return Response.json({ error: 'Unknown action.' }, { status: 400 });
    const { content, ...provenance } = await fetchPublicDocument(input.url);
    const existing = await base44.entities.AstraReference.filter({ resolved_url: provenance.resolved_url, content_sha256: provenance.content_sha256 }, '-created_date', 1);
    if (existing.length) return Response.json({ reference: existing[0], duplicate: true });
    const heading = content.match(/^#\s+(.+)$/m)?.[1];
    const title = String(heading || new URL(provenance.resolved_url).pathname.split('/').pop() || 'Public reference').slice(0, 160);
    const uid = `reference-${crypto.randomUUID()}`;
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([content], `${uid}.md`, { type: 'text/plain' }) });
    const record = await base44.entities.AstraReference.create({
      uid, title, source_repo: provenance.publisher,
      summary: 'Raw source imported with provenance. Technical accuracy, version compatibility and reuse license require review.',
      keywords: [provenance.publisher.toLowerCase()], file_uri: uploaded.file_uri,
      created_at: provenance.retrieved_at, ...provenance
    });
    return Response.json({ reference: record, duplicate: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
