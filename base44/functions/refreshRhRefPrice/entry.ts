// Refreshes the ETH/USD reference price used to convert quote-token amounts into USD.
// Plain outbound fetch to public spot endpoints — no integration credits consumed.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertEngineCaller } from "../../shared/rhAuth.js";

const SOURCES = [
  {
    name: "coinbase",
    url: "https://api.coinbase.com/v2/prices/ETH-USD/spot",
    pick: (j) => Number(j?.data?.amount),
  },
  {
    name: "kraken",
    url: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
    pick: (j) => Number(Object.values(j?.result || {})[0]?.c?.[0]),
  },
];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44, req);
    if (denied) return denied;
    const db = base44.asServiceRole;

    let price = 0;
    let source = null;
    for (const candidate of SOURCES) {
      try {
        const res = await fetch(candidate.url);
        if (!res.ok) continue;
        const value = candidate.pick(await res.json());
        if (value > 0) {
          price = value;
          source = candidate.name;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!price) {
      const existing = await db.entities.RhRefPrice.filter({ symbol: "ETH" });
      return Response.json({
        ok: false,
        message: "All reference sources failed; keeping last known price.",
        price_usd: existing[0]?.price_usd || 0,
      });
    }

    const rows = await db.entities.RhRefPrice.filter({ symbol: "ETH" });
    const data = { symbol: "ETH", price_usd: price, source, updated_at: Date.now() };
    if (rows[0]) await db.entities.RhRefPrice.update(rows[0].id, data);
    else await db.entities.RhRefPrice.create(data);

    return Response.json({ ok: true, price_usd: price, source });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}