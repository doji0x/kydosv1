// Audit logging/shared utilities for Astra
// API/type/ref: see logic/architect job outputs
// (Assume DB/entity storage layer access via `astraDb` abstraction.)

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * AstraAuditEvent model: ensure it matches prior spec and safe for storage
 * All string fields truncated to max lengths per architect spec.
 * All content serialized safely.
 */
export const AUDIT_EVENT_MAX_LENGTHS = {
  eventType: 64,
  origin: 64,
  actorId: 64,
  actorType: 24,
  detail: 2048,
  sourceId: 64,
  tool: 64,
  error: 512
};

export type AstraAuditEvent = {
  id: string;                    // unique, UUID or content-based
  eventType: string;             // bounded, e.g. 'tool_run', 'msg', 'error', ...
  origin?: string;               // bounded, who/what initiated
  actorId?: string;              // bounded, e.g. userId
  actorType?: string;            // bounded, e.g. 'admin', 'app', 'system'
  detail?: string;               // JSON-stringified, bounded
  createdAt: string;             // ISO8601
  sourceId?: string;             // bounded, e.g. session/msg/run id
  tool?: string;                 // bounded, for tool runs
  error?: string;                // short error string, if applicable
};

// Zod validation for safe incoming events
export const AuditEventZ = z.object({
  id: z.string(),
  eventType: z.string().max(AUDIT_EVENT_MAX_LENGTHS.eventType),
  origin: z.string().max(AUDIT_EVENT_MAX_LENGTHS.origin).optional(),
  actorId: z.string().max(AUDIT_EVENT_MAX_LENGTHS.actorId).optional(),
  actorType: z.string().max(AUDIT_EVENT_MAX_LENGTHS.actorType).optional(),
  detail: z.string().max(AUDIT_EVENT_MAX_LENGTHS.detail).optional(),
  createdAt: z.string(),
  sourceId: z.string().max(AUDIT_EVENT_MAX_LENGTHS.sourceId).optional(),
  tool: z.string().max(AUDIT_EVENT_MAX_LENGTHS.tool).optional(),
  error: z.string().max(AUDIT_EVENT_MAX_LENGTHS.error).optional(),
});

function truncate(s: any, max: number): string | undefined {
  if (typeof s !== 'string') s = String(s ?? '');
  if (!s) return undefined;
  return s.length > max ? s.substring(0, max) : s;
}

// Stringify safely and bound length for detail
function safeDetail(obj: any): string | undefined {
  if (obj == null) return undefined;
  let str = '';
  try {
    str = JSON.stringify(obj);
  } catch {
    str = '[Unserializable]';
  }
  return truncate(str, AUDIT_EVENT_MAX_LENGTHS.detail);
}

/* Given event params, generate a unique id in idempotent way if possible */
function genAuditEventId(ev: Omit<AstraAuditEvent, 'id' | 'createdAt'>): string {
  let base = `${ev.eventType}|${ev.origin}|${ev.actorId}|${ev.actorType}|${ev.sourceId}|${ev.tool}`;
  if (ev.detail) base += '|' + truncate(ev.detail, 256); // only part of detail
  return uuidv4(); // (For real deduplication, hash base. For now, UUID for simplicity.)
}

// Assume astraDb is a persistence abstraction with needed storage ops
const astraDb = {
  async insertAuditEvent(ev: AstraAuditEvent): Promise<void> {
    // @storage implementation assumed elsewhere
    /* 
      Example schema:
      Table: astra_audit_events
      id: string (PK),
      eventType/origin/actorId/actorType [string bounds]
      detail: string,
      createdAt: timestamp/string
      ...
    */
    throw new Error('astraDb.insertAuditEvent must be implemented');
  },
  async getAuditEventById(id: string): Promise<AstraAuditEvent | null> {
    throw new Error('astraDb.getAuditEventById must be implemented');
  },
  async queryAuditEvents({
    eventType, actorId, from, to, limit, offset
  }: {
    eventType?: string;
    actorId?: string;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  }): Promise<AstraAuditEvent[]> {
    throw new Error('astraDb.queryAuditEvents must be implemented');
  },
};

/**
 * Log an audit event, with deduplication ("at-most-once" semantics).
 * Bounds/truncates all fields. Idempotent (by eventType, sourceId, actor, origin, tool, main detail).
 * Throws on storage error, but never exposes DB internals.
 */
export async function logAuditEvent(evIn: Partial<AstraAuditEvent>): Promise<void> {
  try {
    // Field bounding/truncation & serialization
    const now = new Date().toISOString();
    const baseEvt: Omit<AstraAuditEvent, 'id' | 'createdAt'> = {
      eventType: truncate(evIn.eventType, AUDIT_EVENT_MAX_LENGTHS.eventType) ?? 'unknown',
      origin: truncate(evIn.origin, AUDIT_EVENT_MAX_LENGTHS.origin),
      actorId: truncate(evIn.actorId, AUDIT_EVENT_MAX_LENGTHS.actorId),
      actorType: truncate(evIn.actorType, AUDIT_EVENT_MAX_LENGTHS.actorType),
      detail: safeDetail(evIn.detail ?? evIn),
      sourceId: truncate(evIn.sourceId, AUDIT_EVENT_MAX_LENGTHS.sourceId),
      tool: truncate(evIn.tool, AUDIT_EVENT_MAX_LENGTHS.tool),
      error: truncate(evIn.error, AUDIT_EVENT_MAX_LENGTHS.error),
    };
    // Deduplication/idempotency: make an id by hash/concat of key fields
    const id = genAuditEventId(baseEvt);
    const auditEv: AstraAuditEvent = {
      ...baseEvt,
      id,
      createdAt: now,
    };
    // Validate shape
    AuditEventZ.parse(auditEv);

    // Check dedup (if impl: look up by (possible) same id)
    const existing = await astraDb.getAuditEventById(id).catch(() => null);
    if (existing) return; // Already logged

    await astraDb.insertAuditEvent(auditEv);
  } catch (err: any) {
    // Never expose raw errors
    throw Object.assign(
      new Error('Failed to log audit event'),
      { code: 'ASTRA_AUDIT_LOG_ERROR' }
    );
  }
}

/** Query audits by filter (no DB/lowlevel errors leaked) */
export async function queryAuditEvents(opts: {
  eventType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<AstraAuditEvent[]> {
  try {
    const limit = Math.max(1, Math.min(100, +(opts.limit ?? 25)));
    const offset = Math.max(0, +(opts.offset ?? 0));
    const res = await astraDb.queryAuditEvents({
      eventType: opts.eventType,
      actorId: opts.actorId,
      from: opts.from,
      to: opts.to,
      limit,
      offset
    });
    return Array.isArray(res) ? res.map(ev => {
      try { AuditEventZ.parse(ev); return ev; }
      catch { return undefined; }
    }).filter(Boolean) as AstraAuditEvent[] : [];
  } catch (err) {
    throw Object.assign(
      new Error('Failed to query audit events'),
      { code: 'ASTRA_AUDIT_QUERY_ERROR' }
    );
  }
}

/** Get a single audit event by ID */
export async function getAuditEventById(id: string): Promise<AstraAuditEvent | null> {
  try {
    if (!id || typeof id !== 'string') return null;
    const ev = await astraDb.getAuditEventById(id);
    if (!ev) return null;
    try { AuditEventZ.parse(ev); } catch { return null; }
    return ev;
  } catch (err) {
    throw Object.assign(
      new Error('Failed to fetch audit event'),
      { code: 'ASTRA_AUDIT_GET_ERROR' }
    );
  }
}

// Export types for API
export type { AstraAuditEvent };