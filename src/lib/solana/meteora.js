// Offline DAMM v2 preparation. No wallet submission or migration-ready claim.
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export const DAMM_PROGRAM_ID = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const MIN_SQRT_PRICE = 4_295_048_016n;
export const MAX_SQRT_PRICE = 79_226_673_521_066_979_257_578_248_091n;
export const CONFIG_SPACE = 328;
export const CONFIG_DISCRIMINATOR = Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]);
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const Q128 = 1n << 128n;

/** @param {bigint} value */
function checkedU64(value) {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) throw new Error('Expected a u64 bigint');
  return value;
}

/** @param {bigint} n */
function sqrtFloor(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const next = (x + n / x) / 2n;
    if (next >= x) return x;
    x = next;
  }
}

/** @param {bigint} n @param {bigint} d */
const ceilDiv = (n, d) => (n + d - 1n) / d;

// Exact full-range positive quadratic root; independently checked against SDK
// Decimal math at 120 digits. Normal SDK precision can lose low Q64 bits.
/** @param {bigint} tokenA @param {bigint} tokenB */
export function quoteSeedLiquidity(tokenA, tokenB) {
  checkedU64(tokenA); checkedU64(tokenB);
  if (tokenA === 0n || tokenB === 0n) throw new Error('Seed budgets must be positive');
  const aHigh = tokenA * MAX_SQRT_PRICE;
  const bQ = tokenB * Q128;
  const beta = bQ - aHigh * MIN_SQRT_PRICE;
  const sqrtPrice = (sqrtFloor(beta * beta + 4n * aHigh * bQ * MAX_SQRT_PRICE) - beta) / (2n * aHigh);
  if (sqrtPrice <= MIN_SQRT_PRICE || sqrtPrice >= MAX_SQRT_PRICE) throw new Error('Seed price outside full range');
  const fromA = tokenA * sqrtPrice * MAX_SQRT_PRICE / (MAX_SQRT_PRICE - sqrtPrice);
  const fromB = bQ / (sqrtPrice - MIN_SQRT_PRICE);
  const liquidity = fromA < fromB ? fromA : fromB;
  const tokenAAmount = ceilDiv(liquidity * (MAX_SQRT_PRICE - sqrtPrice), sqrtPrice * MAX_SQRT_PRICE);
  const tokenBAmount = ceilDiv(liquidity * (sqrtPrice - MIN_SQRT_PRICE), Q128);
  if (liquidity === 0n || liquidity > U128_MAX || tokenAAmount === 0n || tokenBAmount === 0n
      || tokenAAmount > tokenA || tokenBAmount > tokenB) throw new Error('Seed amount or liquidity out of bounds');
  return Object.freeze({ sqrtPrice, liquidity, tokenAAmount, tokenBAmount,
    tokenADust: tokenA - tokenAAmount, tokenBDust: tokenB - tokenBAmount });
}

/** @param {bigint} index */
export function deriveConfigAddress(index) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(checkedU64(index));
  return PublicKey.findProgramAddressSync([Buffer.from('config'), bytes], DAMM_PROGRAM_ID)[0];
}

// A program ID and an approved private config must be supplied explicitly.
// Deriving an address does not establish that either is deployed/provisioned.
export function deriveMigrationAddresses(launchpad, tokenMint, privateConfig) {
  const program = new PublicKey(launchpad), mint = new PublicKey(tokenMint), config = new PublicKey(privateConfig);
  if (mint.equals(WSOL_MINT)) throw new Error('Token A must differ from WSOL');
  const local = seeds => PublicKey.findProgramAddressSync(seeds, program)[0];
  const damm = seeds => PublicKey.findProgramAddressSync(seeds, DAMM_PROGRAM_ID)[0];
  const seed = name => Buffer.from(name);
  const curve = local([seed('curve'), mint.toBuffer()]);
  const forCurve = name => local([seed(name), curve.toBuffer()]);
  const positionNftMint = forCurve('meteora_position_mint');
  // Descending PDA seed order; instruction token A/B roles stay coin/WSOL.
  const orderedMints = [mint.toBuffer(), WSOL_MINT.toBuffer()].sort(Buffer.compare).reverse();
  const pool = damm([seed('pool'), config.toBuffer(), ...orderedMints]);
  return Object.freeze({ mint, config, curve, pool,
    receipt: forCurve('migration_receipt'), payer: forCurve('migration_payer'),
    poolCreatorAuthority: local([seed('meteora_pool_creator')]),
    positionOwner: forCurve('meteora_position_owner'), positionNftMint,
    tokenAStaging: local([seed('migration_token'), curve.toBuffer(), mint.toBuffer()]),
    tokenBStaging: local([seed('migration_token'), curve.toBuffer(), WSOL_MINT.toBuffer()]),
    poolAuthority: damm([seed('pool_authority')]),
    position: damm([seed('position'), positionNftMint.toBuffer()]),
    positionNftAccount: damm([seed('position_nft_account'), positionNftMint.toBuffer()]),
    tokenAVault: damm([seed('token_vault'), mint.toBuffer(), pool.toBuffer()]),
    tokenBVault: damm([seed('token_vault'), WSOL_MINT.toBuffer(), pool.toBuffer()]),
    eventAuthority: damm([seed('__event_authority')]),
  });
}

// Fixed zero-copy Config layout from the pinned IDL. Dynamic fee parameters
// come from the initialization instruction, not the config's unused fee fields.
export function validatePrivateConfig({ address, account, approvedConfig, creatorAuthority }) {
  if (!account || !new PublicKey(address).equals(new PublicKey(approvedConfig))
      || new PublicKey(creatorAuthority).equals(PublicKey.default)
      || !account.owner.equals(DAMM_PROGRAM_ID) || account.executable) throw new Error('Unapproved DAMM config account');
  const data = Buffer.from(account.data);
  if (data.length !== CONFIG_SPACE || !data.subarray(0, 8).equals(CONFIG_DISCRIMINATOR)
      || !data.subarray(8, 40).equals(Buffer.alloc(32))
      || !data.subarray(40, 72).equals(new PublicKey(creatorAuthority).toBuffer())
      || data[202] !== 1 || !data.subarray(248, 264).equals(Buffer.alloc(16))) {
    throw new Error('Expected a private dynamic config with strict mint validation');
  }
  const index = data.readBigUInt64LE(208);
  if (!deriveConfigAddress(index).equals(new PublicKey(address))) throw new Error('Invalid config PDA');
  return Object.freeze({ index, creatorAuthority: new PublicKey(creatorAuthority).toBase58() });
}
