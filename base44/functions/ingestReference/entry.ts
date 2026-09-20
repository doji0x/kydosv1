import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const MAX_BYTES = 1_000_000;
const allowedTypes = ['text/', 'application/json', 'application/xml', 'application/javascript', 'application/x-javascript'];
const clean = (value, max) => String(value || '').trim().slice(0, max);
const slug = value => clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function sourceFromUrl(url) {
  const rawMatch = url.hostname === 'raw.githubusercontent.com' && url.pathname.match(/^\/([^/]+)\/([^/]+)/);
  const githubMatch = url.hostname === 'github.com' && url.pathname.match(/^\/([^/]+)\/([^/]+)/);
  const match = rawMatch || githubMatch;
  return match ? `${match[1]}/${match[2].replace(/\.git$/, '')}` : url.hostname;
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    if (input.action !== 'ingest') return Response.json({ error: 'Unknown action.' }, { status: 400 });

    let url;
    try { url = new URL(clean(input.url, 2000)); } catch { return Response.json({ error: 'Enter a valid public file URL.' }, { status: 400 }); }
    if (!['http:', 'https:'].includes(url.protocol)) return Response.json({ error: 'Only HTTP and HTTPS links are supported.' }, { status: 400 });

    const fetched = await fetch(url.toString(), { headers: { accept: 'text/plain,text/markdown,application/json,text/*' }, redirect: 'follow' });
    if (!fetched.ok) return Response.json({ error: `The link returned ${fetched.status}.` }, { status: 400 });
    const contentType = (fetched.headers.get('content-type') || '').toLowerCase();
    if (!allowedTypes.some(type => contentType.startsWith(type))) return Response.json({ error: 'The link must point to a text-based file.' }, { status: 400 });
    const declaredSize = Number(fetched.headers.get('content-length') || 0);
    if (declaredSize > MAX_BYTES) return Response.json({ error: 'The file must be 1 MB or smaller.' }, { status: 400 });
    const bytes = new Uint8Array(await fetched.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return Response.json({ error: 'The file must be 1 MB or smaller.' }, { status: 400 });
    if (bytes.includes(0)) return Response.json({ error: 'The link appears to contain a binary file.' }, { status: 400 });
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    if (!content) return Response.json({ error: 'The linked file is empty.' }, { status: 400 });

    const metadata = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Create searchable metadata for this external protocol reference. Return a precise title, a concise summary of what an engineering agent can learn from it, and 5-12 lowercase technical keywords.\n\nSOURCE URL: ${url.toString()}\n\nCONTENT:\n${content.slice(0, 120000)}`,
      response_json_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'summary', 'keywords']
      }
    });
    const title = clean(metadata.title, 160);
    const summary = clean(metadata.summary, 4000);
    if (!title || !summary) throw new Error('Could not generate reference metadata.');
    const uid = `${slug(title) || 'reference'}-${Date.now().toString(36)}`;
    const file = new File([content], `${uid}.md`, { type: 'text/markdown' });
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    const record = await base44.entities.AstraReference.create({
      uid,
      title,
      source_repo: sourceFromUrl(url),
      summary,
      keywords: (Array.isArray(metadata.keywords) ? metadata.keywords : []).map(value => clean(value, 60).toLowerCase()).filter(Boolean).slice(0, 30),
      file_uri: uploaded.file_uri,
      created_at: new Date().toISOString()
    });
    return Response.json({ reference: record });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}