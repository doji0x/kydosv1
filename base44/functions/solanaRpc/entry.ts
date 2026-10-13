import { limitPublicRequests } from '../../shared/publicRateLimit.js';
import { secrets } from 'base44:runtime';
import { relayMainnetRpc, RpcRelayError } from '../../shared/solanaRpcRelay.js';

export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({error:'Use POST.'}, {status:405});
  if (!limitPublicRequests(req, 90)) return Response.json({error:'Too many network requests. Try again shortly.'}, {status:429});
  let input: unknown;
  try { input = await req.json(); }
  catch { return Response.json({error:'Invalid RPC request JSON'}, {status:400}); }
  try {
    const data = await relayMainnetRpc(secrets.get('HELIUS_RPC_URL'), input);
    return Response.json(data);
  } catch (error) {
    const known = error instanceof RpcRelayError;
    return Response.json({error:known ? error.message : 'Mainnet RPC unavailable'}, {status:known ? error.status : 503});
  }
}
