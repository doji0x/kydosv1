import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import bs58 from 'bs58';
import * as web3 from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { buildCreateTransaction, PROGRAM_ID, METADATA_PROGRAM_ID, CURVE_SPACE, FEE_POLICY_SPACE, METADATA_SPACE } from '../../src/lib/solana/client.js';
import { estimateTransactionCosts } from '../../src/lib/solana/costs.js';
import { buildAdminLaunchTransaction, estimateAdminLaunchCosts, requireAdminFunds, adminSimulationError } from '../../base44/shared/adminLaunch.js';
import { identifySolanaNetwork, inspectLaunchNetwork } from '../../base44/shared/solanaNetwork.js';
import { PROGRAM_ADDRESS } from '../../base44/shared/solanaProtocol.js';
const chain = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', network = identifySolanaNetwork(chain), signer = web3.Keypair.generate();
function rpc() { return { getLatestBlockhash: async () => ({ blockhash: web3.Keypair.generate().publicKey.toBase58() }), getBalance: async () => 1000000000, getFeeForMessage: async () => ({ value: 10000 }), getMinimumBalanceForRentExemption: async size => size * 17 + 10 }; }
test('admin initialize, fee-policy account, signatures and costs match the Anchor client', async () => {
  const connection = rpc(), details = { name: 'Kydos 🚀', symbol: 'KYDO', metadataUri: 'https://example.com/token.json' };
  const browser = await buildCreateTransaction({ connection, wallet: { publicKey: signer.publicKey }, ...details, initialBuyLamports: 0n });
  const admin = buildAdminLaunchTransaction(web3, { signer, mint: browser.mint, programId: PROGRAM_ID, metadataProgramId: METADATA_PROGRAM_ID, tokenProgramId: TOKEN_PROGRAM_ID, ...details, blockhash: (await connection.getLatestBlockhash()).blockhash });
  assert.deepEqual(admin.transaction.instructions, browser.transaction.instructions);
  admin.transaction.sign(signer, browser.mint); assert.equal(admin.transaction.verifySignatures(), true); assert.equal(admin.transaction.compileMessage().header.numRequiredSignatures, 2); assert.ok(admin.transaction.serialize().length <= 1232);
  const costs = await estimateAdminLaunchCosts(connection, admin.transaction, signer.publicKey);
  const expected = await estimateTransactionCosts({ connection, transaction: admin.transaction, payer: signer.publicKey, prepared: true, context: { ...browser.metadata, curveSpace: CURVE_SPACE, feePolicySpace: FEE_POLICY_SPACE, metadataSpace: METADATA_SPACE } });
  for (const key of ['requiredLamports', 'rentLamports', 'metadataFeeLamports', 'networkFeeLamports', 'balanceLamports']) assert.equal(BigInt(costs[key]), expected[key], key);
});
test('funding errors identify server payer; missing fee estimates fail closed', async () => {
  assert.throws(() => requireAdminFunds({ sufficient: false, balanceLamports: 0, requiredLamports: 10000000, shortfallLamports: 10000000 }, signer.publicKey.toBase58(), network), error => error.message.includes(signer.publicKey.toBase58()) && /server wallet, not your connected Phantom/.test(error.message));
  await assert.rejects(estimateAdminLaunchCosts({ ...rpc(), getFeeForMessage: async () => ({ value: null }) }, { compileMessage: () => ({}) }, signer.publicKey), /Network fee unavailable/);
});
test('debit errors call getLogs even when Solana returned empty logs', async () => {
  let called = 0;
  const result = await adminSimulationError(Object.assign(new Error('Attempt to debit an account but found no record of a prior credit'), { getLogs: async () => { called++; return []; } }), rpc(), { network, wallet: signer.publicKey.toBase58(), costs: { balanceLamports: 0, requiredLamports: 10000 } });
  assert.equal(called, 1); assert.deepEqual(result.logs, []); assert.equal(result.submitted, false); assert.match(result.error, /Phantom funds do not pay/);
});
test('full network hashes and missing-program diagnosis are distinct', async () => {
  assert.equal(identifySolanaNetwork('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d').cluster, 'mainnet-beta');
  assert.equal(network.cluster, 'devnet'); assert.throws(() => identifySolanaNetwork('unsupported'), /HELIUS_RPC_URL/);
  const status = await inspectLaunchNetwork({ getGenesisHash: async () => chain, getAccountInfo: async key => key.equals(PROGRAM_ID) ? null : { executable: true } }, PROGRAM_ID, METADATA_PROGRAM_ID);
  assert.equal(status.programDeployed, false); assert.match(status.blockedReason, /not deployed on Solana devnet/);
});
// Execute the actual handler with mocked auth/secrets/RPC, no network or writes.
const source = ts.transpile(readFileSync(new URL('../../base44/functions/adminLaunchToken/entry.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }).replace(/^import .*;\n/gm, '').replace('export default async function', 'return async function');
const factory = new Function('createClientFromRequest', 'secrets', 'bs58', 'web3', 'TOKEN_PROGRAM_ID', 'inspectLaunchNetwork', 'PROGRAM_ADDRESS', 'buildAdminLaunchTransaction', 'estimateAdminLaunchCosts', 'requireAdminFunds', 'adminSimulationError', source);
function fixture({ balance = 1000000000, deployed = true, simulation = null, transportFailure = false } = {}) {
  const payer = web3.Keypair.generate(), receipts = [], calls = [];
  class Connection {
    getGenesisHash = async () => chain;
    getAccountInfo = async key => key.toBase58() === PROGRAM_ADDRESS ? (deployed ? { executable: true } : null) : key.equals(payer.publicKey) ? { executable: false, owner: web3.SystemProgram.programId, data: Buffer.alloc(0) } : { executable: true };
    getBalance = async () => balance;
    getFeeForMessage = async () => ({ value: 10000 });
    getMinimumBalanceForRentExemption = async size => size * 10;
    getLatestBlockhash = async () => ({ blockhash: web3.Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 900 });
    simulateTransaction = async signed => { calls.push('simulate'); assert.equal(signed.signatures.length, 2); return { value: { err: simulation, logs: [] } }; };
    sendRawTransaction = async wire => { calls.push('send'); assert.equal(receipts.length, 1); if (transportFailure) throw new Error('connection dropped'); return bs58.encode(web3.Transaction.from(wire).signature); };
    getSignatureStatuses = async () => ({ value: [{ err: null, confirmationStatus: 'confirmed' }] });
  }
  const base44 = { auth: { me: async () => ({ id: 'admin-id', role: 'admin' }) }, asServiceRole: { entities: { AdminLaunchReceipt: { filter: async query => receipts.filter(row => row.request_id === query.request_id && row.user_id === query.user_id), create: async row => { receipts.push(row); return row; } } } } };
  const fallback = web3.Keypair.generate();
  const handler = factory(() => base44, { get: key => key === 'HELIUS_RPC_URL' ? 'https://example.invalid' : key === 'SOLANA_MAINNET_PRIVATE_KEY' ? JSON.stringify([...payer.secretKey]) : key === 'KYDOS_DEPLOYER_KEY' ? JSON.stringify([...fallback.secretKey]) : undefined }, bs58, { ...web3, Connection }, TOKEN_PROGRAM_ID, inspectLaunchNetwork, PROGRAM_ADDRESS, buildAdminLaunchTransaction, estimateAdminLaunchCosts, requireAdminFunds, adminSimulationError);
  const invoke = async (action, extra = {}) => { const response = await handler(new Request('https://example.invalid/function', { method: 'POST', body: JSON.stringify({ action, requestId: '65c246c5-d3e2-4f81-8e5f-abcdd63eb381', name: 'Test', symbol: 'TEST', metadataUri: 'https://example.com/token.json', expectedWallet: payer.publicKey.toBase58(), expectedChain: chain, chain, ...extra }) })); return { status: response.status, data: await response.json() }; };
  return { invoke, calls, receipts, payer };
}
test('admin handler preserves mainnet-wallet precedence and blocks an unfunded payer', async () => {
  const f = fixture({ balance: 0 }), status = await f.invoke('status'); assert.equal(status.data.wallet, f.payer.publicKey.toBase58()); assert.equal(status.data.programId, PROGRAM_ADDRESS); assert.equal(status.data.ready, false);
  const result = await f.invoke('launch'); assert.equal(result.status, 422); assert.equal(result.data.submitted, false); assert.deepEqual(f.calls, []);
});
test('admin handler rejects missing deployment and network changes before simulation', async () => {
  const f = fixture({ deployed: false }); assert.match((await f.invoke('status')).data.blockedReason, /not deployed/); assert.equal((await f.invoke('launch')).status, 422); assert.deepEqual(f.calls, []);
  const g = fixture(); assert.equal((await g.invoke('launch', { expectedChain: 'other-chain' })).data.submitted, false); assert.deepEqual(g.calls, []);
});
test('signed simulation failure returns logs and never broadcasts', async () => {
  const f = fixture({ simulation: 'AccountNotFound' }), result = await f.invoke('launch'); assert.equal(result.status, 422); assert.deepEqual(result.data.logs, []); assert.match(result.data.error, /native SOL/); assert.deepEqual(f.calls, ['simulate']);
});
test('ambiguous admin send recovers receipt without client signature and never relaunches', async () => {
  const f = fixture({ transportFailure: true }), result = await f.invoke('launch'); assert.equal(result.status, 202); assert.equal(result.data.state, 'unknown');
  const recovered = await f.invoke('check'); assert.equal(recovered.data.state, 'confirmed'); assert.equal(recovered.data.signature, result.data.signature);
  await f.invoke('launch'); assert.deepEqual(f.calls, ['simulate', 'send']);
});
