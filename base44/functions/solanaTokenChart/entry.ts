import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { fetchHeliusTradePage } from '../../shared/heliusSolanaTrades.ts';

function chartSeries(rows: any[]) {
  const priced = rows.filter(row => row.status === 'confirmed' && row.block_time > 0 && row.sol_amount > 0 && row.token_amount > 0)
    .map(row => ({ t: row.block_time, price: row.sol_amount / row.token_amount, side: row.side,
      solAmount: row.sol_amount, tokenAmount: row.token_amount })).sort((a, b) => a.t - b.t);
  if (!priced.length) return [];
  const bucket = Math.max(1, Math.ceil((priced.at(-1).t - priced[0].t + 1) / 120));
  const points = new Map<number, any>();
  for (const point of priced) points.set(Math.floor(point.t / bucket), point);
  return [...points.values()];
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const input = await req.json();
    const mint = String(input.mint || '').trim();
    const pages = Math.min(5, Math.max(1, Number(input.pages) || 1));
    const apiKey = secrets.get('HELIUS_API_KEY') || secrets.get('HELIUS_PARSE_TRANSACTION_HISTORY_API_KEY');
    if (!apiKey) return Response.json({ error: 'Helius history key is missing' }, { status: 503 });
    let before = input.before ? String(input.before) : undefined;
    let scanned = 0;
    for (let page = 0; page < pages; page++) {
      const result = await fetchHeliusTradePage({ mint, apiKey, before, limit: 100 });
      scanned += result.scanned;
      const existing = result.signatures.length ? await base44.asServiceRole.entities.SolanaTrade.filter({ mint, signature: { $in: result.signatures } }) : [];
      const bySignature = new Map(existing.map((row: any) => [row.signature, row]));
      const normalized = new Set(result.rows.map((row: any) => row.signature));
      const stale = existing.filter((row: any) => !normalized.has(row.signature)).map((row: any) => row.id);
      if (stale.length) await base44.asServiceRole.entities.SolanaTrade.deleteMany({ id: { $in: stale } });
      const additions = result.rows.filter((row: any) => !bySignature.has(row.signature));
      const updates = result.rows.filter((row: any) => bySignature.has(row.signature)).map((row: any) => ({ id: bySignature.get(row.signature).id, ...row }));
      if (additions.length) await base44.asServiceRole.entities.SolanaTrade.bulkCreate(additions);
      if (updates.length) await base44.asServiceRole.entities.SolanaTrade.bulkUpdate(updates);
      before = result.nextBefore || undefined;
      if (result.scanned < 100 || !before) break;
    }
    const rows = await base44.asServiceRole.entities.SolanaTrade.filter({ mint }, '-block_time', 500);
    const validRows = rows.filter((row: any) => row.status === 'confirmed' && row.block_time > 0 && row.sol_amount > 0 && row.token_amount > 0);
    const ordered = [...validRows].sort((a: any, b: any) => a.block_time - b.block_time);
    const sample = validRows.slice(0, 12).map((row: any) => ({ signature: row.signature, side: row.side,
      solAmount: row.sol_amount, tokenAmount: row.token_amount, blockTime: row.block_time }));
    return Response.json({ series: chartSeries(ordered), tradeCount: validRows.length, earliest: ordered[0]?.block_time || null,
      latest: ordered.at(-1)?.block_time || null, nextBefore: before || null, scanned, sample });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}