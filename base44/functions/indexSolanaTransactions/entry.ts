import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { fetchHeliusTradePage } from '../../shared/heliusSolanaTrades.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const input = await req.json();
    const address = String(input.address || '').trim();
    const apiKey = secrets.get('HELIUS_API_KEY') || secrets.get('HELIUS_PARSE_TRANSACTION_HISTORY_API_KEY');
    if (!apiKey) return Response.json({ error: 'Helius history key is missing' }, { status: 503 });
    const result = await fetchHeliusTradePage({ mint: address, apiKey, before: input.before, limit: Number(input.limit) || 50 });
    const existing = result.signatures.length ? await base44.asServiceRole.entities.SolanaTrade.filter({ mint: address, signature: { $in: result.signatures } }) : [];
    const bySignature = new Map(existing.map((row: any) => [row.signature, row]));
    const normalized = new Set(result.rows.map((row: any) => row.signature));
    const stale = existing.filter((row: any) => !normalized.has(row.signature)).map((row: any) => row.id);
    if (stale.length) await base44.asServiceRole.entities.SolanaTrade.deleteMany({ id: { $in: stale } });
    const additions = result.rows.filter((row: any) => !bySignature.has(row.signature));
    const updates = result.rows.filter((row: any) => bySignature.has(row.signature)).map((row: any) => ({ id: bySignature.get(row.signature).id, ...row }));
    if (additions.length) await base44.asServiceRole.entities.SolanaTrade.bulkCreate(additions);
    if (updates.length) await base44.asServiceRole.entities.SolanaTrade.bulkUpdate(updates);
    return Response.json({ indexed: additions.length, scanned: result.scanned, nextBefore: result.nextBefore });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}