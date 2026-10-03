/** Read-only verification primitives. No wallet, signing or RPC submission API. */
import { createHash } from 'node:crypto';

export const BASELINE_COMMIT = '3cce2ed02ac94d3951db33b3a67725182d8d7597';
export const KYDOS_PROGRAM = 'GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE';
export const DAMM_PROGRAM = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
export const LOADER_V3 = 'BPFLoaderUpgradeab1e11111111111111111111111';
export const CREATOR_SEED = 'meteora_pool_creator';
export const CONFIG_DISCRIMINATOR = Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]);
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const requireBytes = (bytes, length, name) => {
  if (!Buffer.isBuffer(bytes) || (length !== null && bytes.length !== length)) fail(`Invalid ${name} bytes`);
  return bytes;
};

export function encodeKey(bytes) {
  requireBytes(bytes, 32, 'public key');
  let n = BigInt(`0x${bytes.toString('hex')}`), text = '';
  while (n) { text = ALPHABET[Number(n % 58n)] + text; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; text = '1' + text; }
  return text;
}
export function decodeKey(text) {
  if (typeof text !== 'string' || text.length < 32 || text.length > 44) fail('Invalid public key');
  let n = 0n;
  for (const c of text) {
    const digit = ALPHABET.indexOf(c);
    if (digit < 0) fail('Invalid public key');
    n = n * 58n + BigInt(digit);
  }
  if (n >= (1n << 256n)) fail('Public key overflow');
  const bytes = Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
  if (encodeKey(bytes) !== text) fail('Noncanonical public key');
  return bytes;
}

export function programDataPointer(account) {
  if (!account) fail('Program account not found');
  if (account.owner !== LOADER_V3 || account.executable !== true) fail('Expected executable loader-v3 program');
  const bytes = requireBytes(account.data, 36, 'program');
  if (bytes.readUInt32LE(0) !== 2) fail('Expected Program loader state');
  return encodeKey(bytes.subarray(4, 36));
}

export function inspectProgramData({ program, account, programDataAddress, programData, derivedProgramData }) {
  decodeKey(program);
  const pointer = programDataPointer(account);
  if (pointer !== programDataAddress || pointer !== derivedProgramData) fail('ProgramData address/PDA mismatch');
  if (!programData || programData.owner !== LOADER_V3 || programData.executable !== false) fail('Invalid ProgramData ownership');
  const bytes = requireBytes(programData.data, null, 'ProgramData');
  if (bytes.length < 49 || bytes.readUInt32LE(0) !== 3) fail('Invalid ProgramData layout');
  const option = bytes[12];
  if (option !== 0 && option !== 1) fail('Invalid upgrade-authority option');
  if (!bytes.subarray(45, 49).equals(Buffer.from([127, 69, 76, 70]))) fail('Missing deployed ELF');
  const authority = option === 1 ? encodeKey(bytes.subarray(13, 45)) : null;
  return Object.freeze({
    program, programData: pointer, loader: LOADER_V3,
    deploymentSlot: bytes.readBigUInt64LE(4).toString(), upgradeAuthority: authority,
    upgradeable: authority !== null, allocationBytes: bytes.length - 45,
    allocatedBytecodeSha256: digest(bytes.subarray(45)),
    // Public keys and bytecode observation do NOT prove signer possession or source parity.
    authorityControlVerified: false, sourceBinaryVerified: false,
  });
}

export function verifyDynamicConfig({ address, account, authority, derivedAddress }) {
  decodeKey(address); decodeKey(authority);
  if (authority === '11111111111111111111111111111111') fail('Default creator authority is forbidden');
  if (!account || account.owner !== DAMM_PROGRAM || account.executable !== false) fail('Invalid config ownership');
  const bytes = requireBytes(account.data, 328, 'config');
  if (!bytes.subarray(0, 8).equals(CONFIG_DISCRIMINATOR)) fail('Invalid config discriminator');
  if (!bytes.subarray(8, 40).equals(Buffer.alloc(32))) fail('AlphaVault configuration is forbidden');
  if (!bytes.subarray(40, 72).equals(decodeKey(authority))) fail('Config creator authority mismatch');
  if (bytes[202] !== 1) fail('Expected dynamic config');
  if (!bytes.subarray(248, 264).equals(Buffer.alloc(16))) fail('Config permissions must be zero');
  if (address !== derivedAddress) fail('Config index/PDA mismatch');
  return Object.freeze({ address, index: bytes.readBigUInt64LE(208).toString(), authority,
    configSha256: digest(bytes), permission: '0', type: 'dynamic' });
}

export function verifyGenesis(observed, expected) {
  decodeKey(observed); decodeKey(expected);
  if (observed !== expected) fail('RPC genesis hash mismatch');
  return observed;
}

/** Compare already-built code to the allocated bytecode, including zero padding. */
export function verifyAllocatedBytecode(allocated, candidate) {
  requireBytes(allocated, null, 'allocated bytecode'); requireBytes(candidate, null, 'candidate bytecode');
  if (candidate.length < 4 || !candidate.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70]))) fail('Candidate is not ELF');
  if (candidate.length > allocated.length || !allocated.subarray(0, candidate.length).equals(candidate)
      || allocated.subarray(candidate.length).some(b => b !== 0)) fail('Deployed bytecode differs from candidate');
  return { candidateSha256: digest(candidate), allocatedSha256: digest(allocated), trailingZeroBytes: allocated.length - candidate.length };
}
