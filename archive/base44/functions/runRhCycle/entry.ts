// One market-data cycle: authenticated admins or a validated external cron header.
// Never expose the cron secret to the browser; child calls remain server-side.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { isCronRequest } from "../../shared/rhAuth.js";
import { rpc, CHAIN_ID } from "../../shared/rhRpc.js";

const STEPS = [
  { name: "refreshRhRefPrice", args: {} },
  { name: "discoverRhPools", args: {} },
  { name: "indexRhBlockRange", args: { max_span: 3000 } },
  { name: "buildRhCandles", args: { max_trades: 10000, tail_bars: 2000 } },
  { name: "indexRhHolders", args: { max_span: 3000 } },
  { name: "computeRhTokenStats", args: {} },
];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await isCronRequest(req, false))) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const expected = secrets.get("RH_CRON_SECRET");
    if (!expected) return Response.json({ error: "Cron secret not configured" }, { status: 503 });
    const started = Date.now();
    const actualChain = Number(BigInt(await rpc("eth_chainId")));
    if (actualChain !== CHAIN_ID) {
      const error = `Network mismatch: the provider reports chain ${actualChain}, but indexing is configured for ${CHAIN_ID}. Indexing stopped before any writes. Existing history must be reviewed before switching networks.`;
      return Response.json({ ok: false, total_ms: Date.now() - started,
        results: [{ step: "verifyNetwork", ok: false, ms: Date.now() - started, error }] }, { status: 409 });
    }
    const results = [{ step: "verifyNetwork", ok: true, ms: Date.now() - started, data: { chain_id: actualChain } }];

    for (const step of STEPS) {
      const t0 = Date.now();
      try {
        const res = await base44.asServiceRole.functions.invoke(step.name, { ...step.args, secret: expected });
        const data = res?.data ?? null;
        const ok = data?.ok !== false && !data?.error;
        results.push({ step: step.name, ok, ms: Date.now() - t0, data,
          ...(ok ? {} : { error: data?.error || data?.message || "Stage reported failure" }) });
      } catch (error) {
        // One failing stage shouldn't abort the rest — stats still improve from partial data.
        results.push({ step: step.name, ok: false, ms: Date.now() - t0, error: error.response?.data?.error || error.message });
      }
    }
    const auditStarted = Date.now();
    try {
      const audit = await base44.asServiceRole.functions.invoke("runRhAudit", { max_reviews: 3, secret: expected });
      results.push({ step: "runRhAudit", ok: true, ms: Date.now() - auditStarted, data: audit?.data ?? null });
    } catch (error) {
      results.push({ step: "runRhAudit", ok: false, ms: Date.now() - auditStarted, error: error.message });
    }

    const ok = results.every((r) => r.ok);
    return Response.json({ ok, total_ms: Date.now() - started, results }, { status: ok ? 200 : 503 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}