import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const text = (value, max) => String(value || '').trim().slice(0, max);
const keywords = value => (Array.isArray(value) ? value : String(value || '').split(','))
  .map(item => text(item, 60).toLowerCase()).filter(Boolean).slice(0, 30);
const slug = value => text(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    const action = text(input.action, 20);

    if (action === 'create' || action === 'update') {
      const title = text(input.title, 160);
      const summary = text(input.summary, 4000);
      const content = String(input.content || '');
      if (!title || !summary || !content.trim()) return Response.json({ error: 'Title, summary, and content are required.' }, { status: 400 });
      if (content.length > 500000) return Response.json({ error: 'Reference content must be 500,000 characters or fewer.' }, { status: 400 });
      const uid = action === 'update' ? text(input.uid, 120) : `${slug(title) || 'reference'}-${Date.now().toString(36)}`;
      const file = new File([content], `${uid}.md`, { type: 'text/markdown' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
      const data = { uid, title, source_repo: text(input.source_repo, 200), summary, keywords: keywords(input.keywords), file_uri: uploaded.file_uri, created_at: text(input.created_at, 40) || new Date().toISOString() };
      const record = action === 'create' ? await base44.entities.AstraReference.create(data) : await base44.entities.AstraReference.update(text(input.id, 80), data);
      return Response.json({ reference: record });
    }

    if (action === 'delete') {
      const id = text(input.id, 80);
      if (!id) return Response.json({ error: 'Reference id is required.' }, { status: 400 });
      await base44.entities.AstraReference.delete(id);
      return Response.json({ deleted: true });
    }

    if (action === 'search') {
      const terms = text(input.query, 300).toLowerCase().split(/\s+/).filter(Boolean);
      const records = await base44.entities.AstraReference.list('-updated_date', 200);
      const results = records.map(record => {
        const haystack = `${record.title} ${record.summary} ${(record.keywords || []).join(' ')} ${record.source_repo || ''}`.toLowerCase();
        return { record, score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
      }).filter(item => !terms.length || item.score > 0).sort((a, b) => b.score - a.score).slice(0, 12)
        .map(({ record }) => ({ id: record.id, uid: record.uid, title: record.title, source_repo: record.source_repo, summary: record.summary, keywords: record.keywords || [] }));
      return Response.json({ results });
    }

    if (action === 'read') {
      const record = await base44.entities.AstraReference.get(text(input.id, 80));
      if (!record) return Response.json({ error: 'Reference not found.' }, { status: 404 });
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: record.file_uri, expires_in: 300 });
      const fileResponse = await fetch(signed.signed_url);
      if (!fileResponse.ok) throw new Error('Could not read the stored reference.');
      return Response.json({ id: record.id, title: record.title, source_repo: record.source_repo, summary: record.summary, signed_url: signed.signed_url, content: await fileResponse.text() });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}