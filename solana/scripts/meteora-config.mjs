#!/usr/bin/env node
// Read-only CLI: no keypair loading, signature requests or transaction submission.
import { readFile } from 'node:fs/promises';
import { Connection } from '@solana/web3.js';
import { prepareConfigRequest, verifyConfig, discoverConfigs, checkApprovedRoute } from './lib/meteora-config.mjs';

const help = `Usage (from repository root):
  node solana/scripts/meteora-config.mjs request --cluster mainnet-beta [--index DECIMAL]
  node solana/scripts/meteora-config.mjs discover --cluster mainnet-beta
  node solana/scripts/meteora-config.mjs verify --cluster mainnet-beta --config ADDRESS
  node solana/scripts/meteora-config.mjs check --cluster mainnet-beta

request is offline. Other commands require KYDOS_RPC_URL (never printed).
Clusters: mainnet-beta or devnet. JSON goes to stdout; redirect it to save a report.
verify checks a candidate; only check uses the committed approval registry.
All commands leave migration disabled; the executable handler is a later milestone.`;

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || !command) { console.log(help); }
  else {
    if (!['request', 'discover', 'verify', 'check'].includes(command)) throw new Error('Unknown command; use --help');
    const allowed = ['--cluster', ...(command === 'request' ? ['--index'] : command === 'verify' ? ['--config'] : [])];
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!allowed.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options[args[i]] !== undefined) {
        throw new Error('Invalid or duplicate option; use --help');
      }
      options[args[i]] = args[i + 1];
    }
    const cluster = options['--cluster'];
    const request = prepareConfigRequest(cluster, options['--index'] ?? null);
    let report = request;
    if (command !== 'request') {
      if (!process.env.KYDOS_RPC_URL) throw new Error('Set KYDOS_RPC_URL in this terminal for read-only RPC checks');
      const url = new URL(process.env.KYDOS_RPC_URL);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('RPC requires an HTTP(S) URL');
      const connection = new Connection(url.toString(), {
        commitment: 'finalized', disableRetryOnRateLimit: true,
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }),
      });
      // Bound requests and suppress transport errors, which can contain API URLs.
      const rpc = new Proxy(connection, { get(target, prop) {
        const member = target[prop];
        if (typeof member !== 'function') return member;
        return async (...params) => {
          try { return await member.apply(target, params); }
          catch { throw new Error('RPC request failed or timed out; check endpoint, access and rate limits locally'); }
        };
      } });
      if (command === 'discover') report = await discoverConfigs(rpc, cluster);
      if (command === 'verify') {
        if (!options['--config']) throw new Error('verify requires --config ADDRESS');
        report = await verifyConfig(rpc, cluster, options['--config']);
      }
      if (command === 'check') {
        const registry = JSON.parse(await readFile(new URL('../config/meteora-routes.json', import.meta.url), 'utf8'));
        report = await checkApprovedRoute(rpc, cluster, registry);
      }
    }
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  // URL parsing can include the input value; never print a raw URL-related error.
  console.error(error.code === 'ERR_INVALID_URL' ? 'Invalid KYDOS_RPC_URL' : error.message);
  process.exitCode = 1;
}
