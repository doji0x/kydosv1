import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import bs58 from 'npm:bs58@6.0.0';
import {
  Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
  Transaction, TransactionInstruction,
} from 'npm:@solana/web3.js@1.99.0';
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4.15';

const PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWxTWqkZqvFmR6UJA4R9C3bZ9S2');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const INITIALIZE_DISCRIMINATOR = Uint8Array.from([175,175,109,31,13,152,155,237]);

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

function encodeString(value) {
  const bytes = new TextEncoder().encode(value), length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, bytes.length, true);
  return Uint8Array.from([...length, ...bytes]);
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const endpoint = secrets.get('HELIUS_RPC_URL');
    if (!endpoint) return Response.json({ error: 'Helius RPC is not configured' }, { status: 503 });
    const signer = signerFromSecret(secrets.get('SOLANA_MAINNET_PRIVATE_KEY') || secrets.get('KYDOS_DEPLOYER_KEY'));
    const connection = new Connection(endpoint, 'confirmed'), input = await req.json();
    const balance = await connection.getBalance(signer.publicKey, 'confirmed');
    const program = await connection.getAccountInfo(PROGRAM_ID, 'confirmed');
    const programReady = Boolean(program?.executable);
    const launchError = programReady ? null : `Kydos launchpad program ${PROGRAM_ID.toBase58()} is not deployed as an executable program on the configured Solana network. Deploy the launchpad program and configure its verified program address before creating tokens.`;
    if (input.action === 'status') return Response.json({ wallet: signer.publicKey.toBase58(), balanceLamports: balance, programId: PROGRAM_ID.toBase58(), programReady, launchError });
    if (!programReady) return Response.json({ error: launchError }, { status: 409 });

    const name = String(input.name || '').trim(), symbol = String(input.symbol || '').trim().toUpperCase(), metadataUri = String(input.metadataUri || '').trim();
    const encoder = new TextEncoder();
    if (!name || encoder.encode(name).length > 32) return Response.json({ error: 'Name must be 1–32 UTF-8 bytes' }, { status: 400 });
    if (!symbol || encoder.encode(symbol).length > 10) return Response.json({ error: 'Ticker must be 1–10 UTF-8 bytes' }, { status: 400 });
    if (!metadataUri || encoder.encode(metadataUri).length > 200) return Response.json({ error: 'Metadata URI must be 1–200 UTF-8 bytes' }, { status: 400 });
    const uri = new URL(metadataUri);
    if (!['https:', 'ipfs:', 'ar:'].includes(uri.protocol) || uri.username || uri.password) return Response.json({ error: 'Use HTTPS, IPFS, or Arweave metadata without credentials' }, { status: 400 });

    const mint = Keypair.generate();
    const [curve] = PublicKey.findProgramAddressSync([new TextEncoder().encode('curve'), mint.publicKey.toBytes()], PROGRAM_ID);
    const [vault] = PublicKey.findProgramAddressSync([new TextEncoder().encode('vault'), mint.publicKey.toBytes()], PROGRAM_ID);
    const [metadata] = PublicKey.findProgramAddressSync([new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), mint.publicKey.toBytes()], METADATA_PROGRAM_ID);
    const data = Uint8Array.from([...INITIALIZE_DISCRIMINATOR, ...encodeString(name), ...encodeString(symbol), ...encodeString(metadataUri)]);
    const instruction = new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.from(data), keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true }, { pubkey: mint.publicKey, isSigner: true, isWritable: true },
      { pubkey: curve, isSigner: false, isWritable: true }, { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: metadata, isSigner: false, isWritable: true }, { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ] });
    const latest = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({ feePayer: signer.publicKey, recentBlockhash: latest.blockhash }).add(instruction);
    transaction.sign(signer, mint);
    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 });
    const confirmation = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    if (confirmation.value.err) throw new Error('Token creation failed on chain');
    return Response.json({ signature, mint: mint.publicKey.toBase58(), curve: curve.toBase58(), vault: vault.toBase58(), wallet: signer.publicKey.toBase58() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}