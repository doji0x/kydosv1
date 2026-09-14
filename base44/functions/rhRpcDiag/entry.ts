// Temporary diagnostic: checks whether eth_call / eth_getBlockReceipts are
// method-banned from this runtime's egress IP or merely rate limited.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { assertEngineCaller } from "../../shared/rhAuth.js";

const PUB = "https://rpc.mainnet.chain.robinhood.com";
const hex = (n) => "0x" + n.toString(16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, params) {
  const res = await fetch(PUB, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  return { method, status: res.status, body: text.slice(0, 120) };
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await assertEngineCaller(base44);
    if (denied) return denied;

    const head = await call("eth_blockNumber", []);
    const latest = Number(BigInt(JSON.parse(head.body).result));
    const probes = [];

    for (let i = 0; i < 3; i++) {
      await sleep(2000);
      probes.push(
        await call("eth_call", [
          { to: "0xe27501d787d647cc82a5b4a7eafd5750386f1b77", data: "0x313ce567" },
          "latest",
        ]),
      );
    }

    await sleep(2000);
    probes.push(await call("eth_getBlockReceipts", [hex(latest - 3)]));

    return Response.json({ latest, probes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}