import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import bs58 from 'npm:bs58@6.0.0';
import * as web3 from 'npm:@solana/web3.js@1.99.0';
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4.15';
import { inspectLaunchNetwork } from '../../shared/solanaNetwork.js';
import { PROGRAM_ADDRESS } from '../../shared/solanaProtocol.js';
import { buildAdminLaunchTransaction, estimateAdminLaunchCosts, requireAdminFunds, adminSimulationError } from '../../shared/adminLaunch.js';
const { Connection, Keypair, PublicKey, VersionedTransaction, SendTransactionError, SystemProgram } = web3;
const PROGRAM_ID = new PublicKey(PROGRAM_ADDRESS);
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
function decodeSecret(value, depth = 0) {
  if (depth > 2) throw new Error('Server launch wallet has an unsupported encoding');
  const text = String(value || '').trim();
  if (!text) throw new Error('Server launch wallet is not configured');
  if (text.includes('=') && /^[A-Z0-9_]+=/.test(text)) return decodeSecret(text.slice(text.indexOf('=') + 1), depth + 1);
  if (text.startsWith('[') || text.startsWith('{') || text.startsWith('"')) {
    const parsed = JSON.parse(text), key = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? parsed : parsed.secretKey || parsed.privateKey;
    return typeof key === 'string' ? decodeSecret(key, depth + 1) : Uint8Array.from(key);
  }
  if (/^\d+(\s*,\s*\d+)+$/.test(text)) return Uint8Array.from(text.split(',').map(Number));
  const hex = text.startsWith('0x') ? text.slice(2) : text;
  if (/^[0-9a-fA-F]+$/.test(hex) && (hex.length === 64 || hex.length === 128)) return Uint8Array.from(hex.match(/.{2}/g).map(byte => parseInt(byte, 16)));
  try { return bs58.decode(text); } catch {
    const decoded = Uint8Array.from(atob(text), character => character.charCodeAt(0));
    if (decoded.length === 32 || decoded.length === 64) return decoded;
    return decodeSecret(new TextDecoder().decode(decoded), depth + 1);
  }
}

function signerFromSecret(value) {
  let bytes;
  try { bytes = decodeSecret(value); }
  catch { throw new Error('Server launch wallet has an unsupported encoding'); }
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error('Server launch wallet must be a 32-byte seed or 64-byte secret key');
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const input = await req.json();
    if (!['status', 'launch', 'check'].includes(input.action)) throw new Error('Unknown launch action.');
    if (input.action !== 'status' && !/^[0-9a-f-]{36}$/i.test(String(input.requestId))) throw new Error('Launch recovery ID required.');
    const endpoint = secrets.get('HELIUS_RPC_URL');
    if (!endpoint) return Response.json({ error: 'Set HELIUS_RPC_URL to your Solana HTTP RPC.' }, { status: 503 });
    // Preserve the owner's mainnet-wallet precedence from main.
    const secret = secrets.get('SOLANA_MAINNET_PRIVATE_KEY') || secrets.get('KYDOS_DEPLOYER_KEY');
    if (!secret) return Response.json({ error: 'The admin server wallet is not configured.' }, { status: 503 });
    const signer = signerFromSecret(secret), connection = new Connection(endpoint.trim(), 'confirmed');
    const availability = await inspectLaunchNetwork(connection, PROGRAM_ID, METADATA_PROGRAM_ID);
    const { network } = availability, wallet = signer.publicKey.toBase58();
    const receipts = base44.asServiceRole.entities.AdminLaunchReceipt;
    const saved = input.action === 'status' ? [] : await receipts.filter({ request_id: input.requestId, user_id: user.id }, '-created_date', 2);
    if (saved.length > 1) throw new Error('Conflicting launch receipts; inspect server wallet history.');
    const stored = saved[0];
    if (input.action === 'check') {
      if (input.chain !== network.chain) throw new Error('RPC network changed. Restore the original RPC network before checking this transaction.');
      if (!stored) return Response.json({ state: 'unknown', network, wallet, requestId: input.requestId });
      if (stored.chain !== network.chain) throw new Error('Receipt network does not match the configured RPC.');
      const { value } = await connection.getSignatureStatuses([stored.signature], { searchTransactionHistory: true });
      const status = value[0];
      const state = status?.err ? 'failed' : ['confirmed', 'finalized'].includes(status?.confirmationStatus) ? 'confirmed' : 'unknown';
      return Response.json({ state, network, wallet: stored.wallet, signature: stored.signature, mint: stored.mint, requestId: input.requestId });
    }
    if (stored) return Response.json({ state: 'unknown', signature: stored.signature, mint: stored.mint, network, wallet: stored.wallet, requestId: input.requestId });
    const statusOnly = input.action === 'status';
    const name = statusOnly ? 'Launch preview' : String(input.name || '').trim();
    const symbol = statusOnly ? 'PREVIEW' : String(input.symbol || '').trim().toUpperCase();
    const metadataUri = statusOnly ? 'https://example.com/metadata.json' : String(input.metadataUri || '').trim();
    const encoder = new TextEncoder();
    if (!name || encoder.encode(name).length > 32) throw new Error('Name must be 1–32 UTF-8 bytes.');
    if (!symbol || encoder.encode(symbol).length > 10) throw new Error('Ticker must be 1–10 UTF-8 bytes.');
    if (!metadataUri || encoder.encode(metadataUri).length > 200) throw new Error('Metadata URI must be 1–200 UTF-8 bytes.');
    const uri = new URL(metadataUri);
    if (!['https:', 'ipfs:', 'ar:'].includes(uri.protocol) || uri.username || uri.password) throw new Error('Use HTTPS, IPFS, or Arweave metadata without credentials.');
    const mint = Keypair.generate(), latest = await connection.getLatestBlockhash('confirmed');
    const built = buildAdminLaunchTransaction(web3, { signer, mint, programId: PROGRAM_ID, metadataProgramId: METADATA_PROGRAM_ID,
      tokenProgramId: TOKEN_PROGRAM_ID, name, symbol, metadataUri, blockhash: latest.blockhash });
    const costs = await estimateAdminLaunchCosts(connection, built.transaction, signer.publicKey);
    const account = await connection.getAccountInfo(signer.publicKey, 'confirmed');
    const payerError = account && (!account.owner.equals(SystemProgram.programId) || account.executable || account.data.length)
      ? 'The server launch wallet must be a system-owned account with no data.' : '';
    let fundingError = '';
    try { requireAdminFunds(costs, wallet, network); } catch (error) { fundingError = error.message; }
    const blockedReason = [availability.blockedReason, fundingError, payerError].filter(Boolean).join(' ');
    if (statusOnly) return Response.json({ wallet, network, ...costs, ready: !blockedReason, blockedReason,
      programId: PROGRAM_ID.toBase58(), programDeployed: availability.programDeployed });
    if (input.expectedChain !== network.chain || input.expectedWallet !== wallet) throw new Error('Server wallet or RPC network changed. Refresh launch status before creating a token.');
    if (blockedReason) return Response.json({ error: blockedReason, wallet, network, costs, submitted: false }, { status: 422 });
    const transaction = built.transaction; transaction.sign(signer, mint);
    const details = { wallet, network, costs };
    try {
      const signed = new VersionedTransaction(transaction.compileMessage(), transaction.signatures.map(item => item.signature!));
      const simulation = await connection.simulateTransaction(signed, { commitment: 'confirmed', sigVerify: true });
      if (!simulation?.value || simulation.value.err === undefined) throw new Error('Simulation result unavailable.');
      if (simulation.value.err !== null) {
        const failure = Object.assign(new Error(JSON.stringify(simulation.value.err)), { logs: simulation.value.logs });
        return Response.json(await adminSimulationError(failure, connection, details), { status: 422 });
      }
    } catch (error) { return Response.json(await adminSimulationError(error, connection, details), { status: 422 }); }
    if (await connection.getGenesisHash() !== network.chain) throw new Error('RPC network changed before submission. Nothing was submitted.');
    const signature = bs58.encode(transaction.signature!);
    const receipt = { signature, mint: mint.publicKey.toBase58(), curve: built.curve.toBase58(), vault: built.vault.toBase58(), wallet, network, requestId: input.requestId };
    await receipts.create({ request_id: input.requestId, user_id: user.id, signature, mint: receipt.mint, wallet, chain: network.chain, last_valid_block_height: latest.lastValidBlockHeight });
    try {
      const returned = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 });
      if (returned !== signature) throw new Error('RPC returned a different signature.');
      const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const status = value[0];
      if (status?.err) return Response.json({ ...receipt, state: 'failed', error: 'Transaction failed on chain.' });
      return Response.json({ ...receipt, state: ['confirmed', 'finalized'].includes(status?.confirmationStatus) ? 'confirmed' : 'submitted' });
    } catch (error) {
      if (error instanceof SendTransactionError && /simulation failed/i.test(error.message)) return Response.json(await adminSimulationError(error, connection, details), { status: 422 });
      return Response.json({ ...receipt, state: 'unknown', error: 'Submission outcome is unresolved. Check this signature before another launch.' }, { status: 202 });
    }
  } catch (error) {
    return Response.json({ error: String(error.message || 'Launch unavailable').replace(/https?:\/\/\S+/g, '[RPC endpoint]'), submitted: false }, { status: 400 });
  }
}
