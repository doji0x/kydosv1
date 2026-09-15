// Diagnostic: probes the configured RH_RPC_URL provider (and the public endpoint for
// comparison) to see which methods it allows and whether it rate limits us.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { assertEngineCaller } from "../../shared/rhAuth.js";
import { TOPIC, TRACKED_TOKENS } from "../../shared/rhConstants.js";

const PUB = "https://rpc.mainnet.chain.robinhood.com";
const hex = (n: number) => "0x" + n.toString(16);

function primaryUrl() {
  try {
    const url = secrets.get("RH_RPC_URL");
    return url && url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

async function call(url: string, method: string, params: unknown[]) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await res.text();
    return { method, status: res.status, body: text.slice(0, 200) };
  } catch (e) {
    return { method, status: 0, body: `fetch failed: ${e.message}` };
  }
}

async function probe(url: string) {
  const head = await call(url, "eth_blockNumber", []);
  let latest = 0;
  try {
    latest = Number(BigInt(JSON.parse(head.body).result));
  } catch {
    return { head, latest: 0, probes: [] };
  }

  const probes = [
    await call(url, "eth_call", [
      { to: TRACKED_TOKENS[0].address, data: "0x313ce567" },
      "latest",
    ]),
    await call(url, "eth_getLogs", [
      {
        fromBlock: hex(latest - 50),
        toBlock: hex(latest),
        topics: [TOPIC.UNIV3_SWAP],
      },
    ]),
    await call(url, "eth_getBlockReceipts", [hex(latest - 3)]),
  ];

  return { head, latest, probes };
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44, req);
    if (denied) return denied;

    const url = primaryUrl();
    const host = url ? new URL(url).host : null;

    return Response.json({
      primary_configured: !!url,
      primary_host: host,
      primary: url ? await probe(url) : null,
      public: await probe(PUB),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}