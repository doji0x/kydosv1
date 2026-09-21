import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { boundedText, contentHash, documentQuality, fetchPublicDocument, pageInteger, referencePage, referenceSummary } from '../../shared/astraReferences.ts';

const text = (value, max) => String(value || '').trim().slice(0, max);
const keywords = value => (Array.isArray(value) ? value : String(value || '').split(','))
  .map(item => text(item, 60).toLowerCase()).filter(Boolean).slice(0, 30);

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    const action = text(input.action, 20);

    if (action === 'create' || action === 'update') {
      const title = text(input.title, 160), summary = text(input.summary, 4000);
      const content = String(input.content || '');
      if (!title || !summary || !content.trim()) throw new Error('Title, summary, and content are required.');
      if (content.length > 500000 || new TextEncoder().encode(content).length > 1_000_000) throw new Error('Reference exceeds the content limit.');
      if (documentQuality(content) !== 'readable-unreviewed') throw new Error('Supply readable source, not an HTML page.');
      const previous = action === 'update' ? await base44.entities.AstraReference.get(text(input.id, 80)) : null;
      if (action === 'update' && !previous) throw new Error('Reference not found.');
      const uid = previous?.uid || `reference-${crypto.randomUUID()}`;
      const hash = await contentHash(content);
      const unchanged = previous?.content_sha256 === hash;
      const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([content], `${uid}.md`, { type: 'text/plain' }) });
      const data = { uid, title, source_repo: text(input.source_repo, 200), summary, keywords: keywords(input.keywords), file_uri: uploaded.file_uri,
        created_at: previous?.created_at || new Date().toISOString(), content_sha256: hash,
        quality: 'readable-unreviewed',
        // Never retain external provenance after manually changing the underlying text.
        source_url: unchanged ? previous.source_url || '' : '', resolved_url: unchanged ? previous.resolved_url || '' : '',
        source_version: unchanged ? previous.source_version || '' : 'manual', publisher: unchanged ? previous.publisher || '' : 'owner-upload',
        retrieved_at: unchanged ? previous.retrieved_at || '' : '', license: unchanged ? previous.license || 'unverified' : 'unverified', content_type: 'text/plain' };
      const record = action === 'create' ? await base44.entities.AstraReference.create(data) : await base44.entities.AstraReference.update(previous.id, data);
      return Response.json({ reference: record });
    }
    if (action === 'delete') {
      const id = text(input.id, 80);
      if (!id) throw new Error('Reference id is required.');
      await base44.entities.AstraReference.delete(id);
      return Response.json({ deleted: true });
    }
    if (action === 'list' || action === 'search') {
      const offset = pageInteger(input.offset, 0, 1000000);
      const limit = pageInteger(input.limit, 5, 10);
      if (!limit) throw new Error('Page size must be positive.');
      // Stable creation order rather than updated_date. Concurrent inventory changes still require a fresh pass.
      const rows = await base44.entities.AstraReference.list('created_date', limit + 1, offset);
      const page = rows.slice(0, limit);
      const terms = text(input.query, 300).toLowerCase().split(/\s+/).filter(Boolean);
      const results = page.filter(record => action === 'list' || !terms.length || terms.some(term => `${record.title} ${record.summary} ${(record.keywords || []).join(' ')} ${record.source_repo || ''}`.toLowerCase().includes(term))).map(referenceSummary);
      return Response.json({ results, offset, scanned: page.length, next_offset: rows.length > limit ? offset + limit : null, scope: 'One inventory page, not a complete-library search. Continue until next_offset is null. Restart if the library changes during enumeration.' });
    }
    if (action === 'fetch') {
      const { content, ...source } = await fetchPublicDocument(input.url);
      if (input.expectedHash && input.expectedHash !== source.content_sha256) throw new Error('Public document changed; restart the read.');
      return Response.json({ ...source, ...referencePage(content, pageInteger(input.offset, 0, 500000), pageInteger(input.limit, 3000, 3000)) });
    }
    if (action === 'read') {
      const record = await base44.entities.AstraReference.get(text(input.id, 80));
      if (!record) return Response.json({ error: 'Reference not found.' }, { status: 404 });
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: record.file_uri, expires_in: 300 });
      // Only the platform-generated private-storage URL is used here; it is never returned to the model.
      const fileResponse = await fetch(signed.signed_url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!fileResponse.ok) throw new Error('Could not read the stored reference.');
      const content = await boundedText(fileResponse), hash = await contentHash(content);
      if ((record.content_sha256 && record.content_sha256 !== hash) || (input.expectedHash && input.expectedHash !== hash)) throw new Error('Reference changed or failed integrity validation; restart the read.');
      return Response.json({ ...referenceSummary(record), content_sha256: hash, ...referencePage(content, pageInteger(input.offset, 0, 500000), pageInteger(input.limit, 3000, 3000)) });
    }
    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
