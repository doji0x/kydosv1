import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 250);
    const events = await base44.asServiceRole.entities.RhAuditEvent.list("-audited_at", limit);
    return Response.json({ events });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}