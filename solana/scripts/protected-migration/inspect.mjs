/** Observe public chain state only. This command never signs or submits a transaction. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { KYDOS_PROGRAM, DAMM_PROGRAM, LOADER_V3, CREATOR_SEED, decodeKey,
  programDataPointer, inspectProgramData, verifyDynamicConfig, verifyGenesis } from './evidence.mjs';

const ENDPOINTS = Object.freeze({ 'mainnet-beta': 'https://api.mainnet-beta.solana.com', devnet: 'https://api.devnet.solana.com' });
const READ_METHODS = new Set(['getGenesisHash', 'getAccountInfo', 'getMultipleAccounts', 'getProgramAccounts']);
export function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!['--cluster','--rpc','--expected-genesis','--config','--out'].includes(name)
        || !args[i + 1] || args[i + 1].startsWith('--') || name in result) throw new Error('Invalid or duplicate command argument');
    result[name] = args[i + 1];
  }
  if (!Object.hasOwn(ENDPOINTS, result['--cluster'])) throw new Error('Explicit --cluster mainnet-beta or devnet is required');
  const url = new URL(result['--rpc'] ?? ENDPOINTS[result['--cluster']]);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('An HTTPS RPC without embedded user/password is required');
  if (result['--expected-genesis']) decodeKey(result['--expected-genesis']);
  if (result['--config']) decodeKey(result['--config']);
  return { cluster: result['--cluster'], rpc: url.href, expectedGenesis: result['--expected-genesis'],
    config: result['--config'], out: result['--out'] };
}
export function readonlyRpc(endpoint, transport = fetch) {
  let id = 0;
  return async (method, params = []) => {
    if (!READ_METHODS.has(method)) throw new Error('RPC method is not on the read-only allowlist');
    const requestId = ++id;
    let response;
    try {
      response = await transport(endpoint, { method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }), signal: AbortSignal.timeout(15000) });
    } catch { throw new Error(`RPC transport unavailable for ${method}`); }
    if (!response.ok) throw new Error(`RPC HTTP ${response.status} for ${method}`);
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('RPC response exceeds size limit'); }
      chunks.push(Buffer.from(value));
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid RPC JSON'); }
    if (body.jsonrpc !== '2.0' || body.id !== requestId || body.error || !Object.hasOwn(body, 'result')) throw new Error(`RPC rejected ${method}`);
    return body.result;
  };
}
function account(value) {
  if (value === null) return null;
  if (!value || !Array.isArray(value.data) || value.data[1] !== 'base64' || typeof value.data[0] !== 'string'
      || typeof value.executable !== 'boolean') throw new Error('Invalid RPC account encoding');
  decodeKey(value.owner);
  const data = Buffer.from(value.data[0], 'base64');
  if (data.toString('base64') !== value.data[0]) throw new Error('Noncanonical account base64');
  return { data, owner: value.owner, executable: value.executable };
}
function context(result, minimum = 0) {
  if (!result || !Number.isSafeInteger(result.context?.slot) || result.context.slot < minimum) throw new Error('Invalid or stale RPC context');
  return result.context.slot;
}
export async function inspect(settings, rpc, PublicKey) {
  const report = { schemaVersion: 1, kind: 'read-only-observation', clusterLabel: settings.cluster,
    generatedAt: new Date().toISOString(), sourceCommit: process.env.GITHUB_SHA ?? null,
    policy: { kydosProgram: KYDOS_PROGRAM, dammProgram: DAMM_PROGRAM, sdkBaseline: '1.4.10' },
    releaseReady: false, authorityControlVerified: false, sourceBinaryVerified: false,
    programs: {}, configs: [], blockers: [] };
  let minSlot = 0;
  try {
    const genesis = await rpc('getGenesisHash'); decodeKey(genesis); report.observedGenesisHash = genesis;
    report.genesisPinned = Boolean(settings.expectedGenesis);
    if (settings.expectedGenesis) verifyGenesis(genesis, settings.expectedGenesis);
    else report.blockers.push('Expected genesis hash was not independently supplied; cluster identity is observation only.');
    for (const [name, id] of [['kydos', KYDOS_PROGRAM], ['damm', DAMM_PROGRAM]]) {
      try {
        const first = await rpc('getAccountInfo', [id, { encoding: 'base64', commitment: 'finalized', minContextSlot: minSlot }]);
        minSlot = context(first, minSlot);
        if (first.value === null) { report.programs[name] = { program: id, status: 'not-found', slot: minSlot }; report.blockers.push(`${name} program was not found on the observed cluster.`); continue; }
        const pointer = programDataPointer(account(first.value));
        const snapshot = await rpc('getMultipleAccounts', [[id, pointer], { encoding: 'base64', commitment: 'finalized', minContextSlot: minSlot }]);
        minSlot = context(snapshot, minSlot);
        if (!Array.isArray(snapshot.value) || snapshot.value.length !== 2) throw new Error('Invalid program snapshot');
        const derivedProgramData = PublicKey.findProgramAddressSync([new PublicKey(id).toBuffer()], new PublicKey(LOADER_V3))[0].toBase58();
        report.programs[name] = { status: 'observed', slot: minSlot, ...inspectProgramData({ program: id,
          account: account(snapshot.value[0]), programDataAddress: pointer, programData: account(snapshot.value[1]), derivedProgramData }) };
        if (name === 'kydos' && !report.programs[name].upgradeable) report.blockers.push('Kydos program is immutable; no in-place upgrade is possible.');
      } catch (error) { report.programs[name] = { program: id, status: 'unverified', reason: error.message }; report.blockers.push(`${name} deployment is unverified.`); }
    }
    const authority = PublicKey.findProgramAddressSync([Buffer.from(CREATOR_SEED)], new PublicKey(KYDOS_PROGRAM))[0].toBase58();
    report.poolCreatorAuthority = authority;
    try {
      let entries;
      if (settings.config) {
        const response = await rpc('getAccountInfo', [settings.config, { encoding: 'base64', commitment: 'finalized', minContextSlot: minSlot }]);
        minSlot = context(response, minSlot); entries = [{ pubkey: settings.config, account: response.value }];
      } else {
        const response = await rpc('getProgramAccounts', [DAMM_PROGRAM, { encoding: 'base64', commitment: 'finalized',
          minContextSlot: minSlot, withContext: true, filters: [{ dataSize: 328 }, { memcmp: { offset: 40, bytes: authority } }] }]);
        minSlot = context(response, minSlot); entries = response.value;
      }
      if (!Array.isArray(entries) || entries.length > 1000) throw new Error('Invalid config scan result');
      for (const candidate of entries) {
        try {
          const decoded = account(candidate.account);
          if (!decoded || decoded.data.length !== 328) throw new Error('Missing or unsupported config layout');
          const indexBytes = decoded.data.subarray(208, 216);
          const derivedAddress = PublicKey.findProgramAddressSync([Buffer.from('config'), indexBytes], new PublicKey(DAMM_PROGRAM))[0].toBase58();
          report.configs.push({ status: 'candidate-verified-not-installed', slot: minSlot,
            ...verifyDynamicConfig({ address: candidate.pubkey, account: decoded, authority, derivedAddress }) });
        } catch (error) { report.configs.push({ address: candidate.pubkey, status: 'rejected', reason: error.message }); }
      }
      report.configScan = 'completed';
      if (!report.configs.some(c => c.status === 'candidate-verified-not-installed')) report.blockers.push('No valid protected configuration found in this layout; operator provisioning or further investigation is required.');
    } catch (error) { report.configScan = 'unverified'; report.blockers.push(`Config discovery unavailable: ${error.message}`); }
    report.observedThroughSlot = minSlot;
  } catch (error) { report.blockers.push(error.message); }
  report.blockers.push('Upgrade-authority signer control, source/binary parity and runtime migration tests require separate evidence.');
  report.status = 'not-release-ready';
  return report;
}
async function main() {
  const settings = options(process.argv.slice(2));
  const { PublicKey } = await import('@solana/web3.js');
  const report = await inspect(settings, readonlyRpc(settings.rpc), PublicKey);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (settings.out) writeFileSync(settings.out, json, { flag: 'wx' });
  console.log(json); // No RPC URL, headers or credentials are included in the report.
  process.exitCode = 2; // Observation alone never satisfies the release gate.
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Read-only inspection failed; no verified deployment/configuration evidence produced.'); process.exitCode = 2; });
}
