import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { PROGRAM_ADDRESS, DECODER_VERSION } from '../../shared/solanaProtocol.js';
import { rpcCall, readNetwork, readRawPage, persistEvents, advanceIndexState } from '../../shared/solanaIndex.js';
// Single worker required: this guard is per isolate, not a distributed lease.
let running = false;
export default async function(req: Request): Promise<Response> {
  let stateEntity: any, state: any, ownsRun = false;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST' }, { status: 405 });
    const base44 = createClientFromRequest(req), token = secrets.get('KYDOS_INDEXER_TOKEN');
    const worker = token && token.length >= 32 && req.headers.get('x-kydos-indexer-token') === token;
    if (!worker && (await base44.auth.me())?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (running) return Response.json({ error: 'Indexer already running' }, { status: 409 });
    running = true; ownsRun = true;
    const input = await req.json(), mode = input.mode || 'live';
    if (!['live', 'history'].includes(mode)) throw new Error('Mode must be live or history');
    const endpoint = secrets.get('HELIUS_RPC_URL');
    if (!endpoint) return Response.json({ error: 'HELIUS_RPC_URL is missing' }, { status: 503 });
    const network = await readNetwork(endpoint), rpc = (method: string, params: any[]) => rpcCall(endpoint, method, params);
    const program = await rpc('getAccountInfo', [PROGRAM_ADDRESS, { commitment: 'finalized', encoding: 'base64' }]);
    if (!program?.value?.executable) return Response.json({ error: `Kydos program is not deployed on ${network.name}` }, { status: 422 });
    stateEntity = base44.asServiceRole.entities.SolanaIndexState;
    const scope = `${network.chain}:${PROGRAM_ADDRESS}:v${DECODER_VERSION}`;
    const found = await stateEntity.filter({ scope }, '-updated_date', 2);
    if (found.length > 1) throw new Error('Duplicate index checkpoints: stop concurrent workers and reconcile before continuing');
    state = found[0] || await stateEntity.create({ scope, chain: network.chain, program: PROGRAM_ADDRESS, history_complete: false });
    if (mode === 'history' && (!state.head || state.history_complete)) return Response.json({ network, state, scanned: 0, indexed: 0 });
    const limit = Math.min(100, Math.max(1, Math.floor(Number(input.limit) || 25)));
    const page = await readRawPage({ rpc, chain: network.chain, limit, before: mode === 'history' ? state.history_before : state.live_before, until: mode === 'live' ? state.head : undefined });
    const indexed = await persistEvents(base44.asServiceRole.entities.SolanaTrade, page.rows);
    const { id, created_date, updated_date, created_by, ...data } = advanceIndexState(state, page, mode);
    state = await stateEntity.update(state.id, { ...data, last_error: '' });
    return Response.json({ network, indexed, scanned: page.scanned, state });
  } catch (error) {
    const message = String(error.message || 'Indexer unavailable').replace(/https?:\/\/\S+/g, '[RPC endpoint]');
    if (state?.id && stateEntity) { try { await stateEntity.update(state.id, { last_error: message }); } catch { /* Preserve original error. */ } }
    return Response.json({ error: message }, { status: 503 });
  } finally { if (ownsRun) running = false; }
}
