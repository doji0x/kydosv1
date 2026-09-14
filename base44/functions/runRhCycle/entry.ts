// Single entry point for one full market-data cycle, callable by an external cron
// (GitHub Actions) with no user session. Authenticity comes from a shared secret,
// so this endpoint must never be reachable without it.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";

const STEPS = [
  { name: "refreshRhRefPrice", args: {} },
  { name: "indexRhBlockRange", args: { max_span: 3000 } },
  { name: "buildRhCandles", args: {} },
  { name: "indexRhHolders", args: { max_span: 3000 } },
  { name: "computeRhTokenStats", args: {} },
];

export default async function (req: Request): Promise<Response> {
  try {
    const expected = secrets.get("RH_CRON_SECRET");
    if (!expected) {
      return Response.json({ error: "Cron secret not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const provided = req.headers.get("x-kydos-cron") || body?.secret || url.searchParams.get("secret");
    if (provided !== expected) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const started = Date.now();
    const results = [];

    for (const step of STEPS) {
      const t0 = Date.now();
      try {
        const res = await base44.asServiceRole.functions.invoke(step.name, step.args);
        results.push({ step: step.name, ok: true, ms: Date.now() - t0, data: res?.data ?? null });
      } catch (error) {
        // One failing stage shouldn't abort the rest — stats still improve from partial data.
        results.push({ step: step.name, ok: false, ms: Date.now() - t0, error: error.message });
      }
    }

    return Response.json({
      ok: results.every((r) => r.ok),
      total_ms: Date.now() - started,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}