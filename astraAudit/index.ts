// astraAudit API endpoint(s)
// GET /astraAudit (query, pagination), GET /astraAudit/:id
import type { AstraAuditEvent } from '../_shared/astraAudit';
import { queryAuditEvents, getAuditEventById } from '../_shared/astraAudit';
import { requireAdminAuth } from '../_shared/auth';
import { parseQueryString } from '../_shared/httpUtils';

// GET /astraAudit?eventType=...&actorId=...&from=...&to=...&offset=...&limit=...
export const GET = async (req: Request, ctx: any) => {
  try {
    await requireAdminAuth(req, ctx); // Throws if not admin
    const query = parseQueryString(req.url);
    const {
      eventType, actorId, from, to,
      offset, limit
    } = query;
    const results: AstraAuditEvent[] = await queryAuditEvents({
      eventType,
      actorId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return new Response(JSON.stringify({
      ok: true,
      results
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      error: err?.code || 'ASTRA_AUDIT_API_ERROR',
      message: err?.message || 'Failed to query audit events'
    }), {
      status: err?.code === 'AUTH_FORBIDDEN' ? 403 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Optionally: GET /astraAudit/:id
export const GET$ID = async (req: Request, ctx: any) => {
  try {
    await requireAdminAuth(req, ctx);
    const id = ctx?.params?.id ?? '';
    if (!id) throw Object.assign(new Error('Missing id'), { code: 'BAD_REQUEST' });
    const event = await getAuditEventById(id);
    if (!event) {
      return new Response(JSON.stringify({ ok: false, error: 'NOT_FOUND', message: 'No such audit event' }), { status: 404 });
    }
    return new Response(JSON.stringify({ ok: true, event }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      error: err?.code || 'ASTRA_AUDIT_API_ERROR',
      message: err?.message || 'Failed to get audit event',
    }), {
      status: err?.code === 'AUTH_FORBIDDEN' ? 403 : (err?.code === 'BAD_REQUEST' ? 400 : 500),
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
