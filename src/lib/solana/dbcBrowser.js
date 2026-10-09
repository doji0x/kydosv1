/** Browser-only DBC adapter. No SDK upgrades, custody keys, raw Meteora claims,
 * custom-curve quotes, migration transactions, or automatic SOL unwrapping.
 * Account layouts are pinned to the already tested DBC 1.5.13/controller policy.
 */
import { Buffer } from 'buffer';
import { BorshAccountsCoder, Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  unpackAccount, unpackMint } from '@solana/spl-token';
import idl from './idl/kydos_launchpad.json' with { type: 'json' };
import { validateLaunch } from './market.js';

export const KYDOS = new PublicKey(idl.address);
export const DBC = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
export const DAMM = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');
export const METADATA = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
export const TREASURY = new PublicKey('5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg');
export const DAMM_CONFIG = new PublicKey('A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck');
export const UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
export const POLICY_HASH = 'fc03c742463f63e839da128dd0fb919ac3cddfb59057f8ab1faeed625e2aa46f';
export const DEVNET = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MAINNET = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const DBC_ROUTE = 'dbc-v1';
export const LAUNCH_SIZE = 242;
const compiledIdl = /** @type {import('@coral-xyz/anchor').Idl} */ (idl);
const coder = new BorshAccountsCoder(compiledIdl);
const pk = value => new PublicKey(value);
const equal = (a, b) => pk(a).equals(pk(b));
const requireValue = (ok, reason) => { if (!ok) throw new Error(reason); };
const pda = (program, ...seeds) => PublicKey.findProgramAddressSync(seeds.map(s =>
  typeof s === 'string' ? Buffer.from(s) : pk(s).toBuffer()), program)[0];
const keyAt = (data, offset) => pk(data.subarray(offset, offset + 32));
const u128 = (d, o) => d.readBigUInt64LE(o) + (d.readBigUInt64LE(o + 8) << 64n);
export const feeAuthority = () => pda(KYDOS, 'dbc_fee_authority');
export const recipientAta = owner => getAssociatedTokenAddressSync(NATIVE_MINT, pk(owner), true);
export const eventAuthority = program => pda(program, '__event_authority');
export const positionAddress = nft => pda(DAMM, 'position', pk(nft));
export const positionNftAccount = nft => pda(DAMM, 'position_nft_account', pk(nft));

export async function sha256(data) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return Buffer.from(hash).toString('hex');
}
async function externalData(info, owner, name, length) {
  requireValue(info && !info.executable && equal(info.owner, owner), `Invalid ${name} owner`);
  const data = Buffer.from(info.data);
  requireValue(data.length === length, `Unsupported ${name} layout`);
  const discriminator = (await sha256(Buffer.from(`account:${name}`))).slice(0, 16);
  requireValue(data.subarray(0, 8).toString('hex') === discriminator, `Invalid ${name} discriminator`);
  return data;
}
export function dbcAddresses(mint, config) {
  mint = pk(mint); config = pk(config);
  requireValue(!mint.equals(NATIVE_MINT), 'Base and quote mint must differ');
  const pair = [mint, NATIVE_MINT].sort((a, b) => Buffer.compare(b.toBuffer(), a.toBuffer()));
  const dbcPool = pda(DBC, 'pool', config, ...pair);
  const pool = pda(DAMM, 'pool', DAMM_CONFIG, ...pair);
  const [launch, bump] = PublicKey.findProgramAddressSync([Buffer.from('dbc_launch'), mint.toBuffer()], KYDOS);
  return { mint, config, launch, bump, dbcPool, pool, feeAuthority: feeAuthority(),
    baseFees: pda(KYDOS, 'dbc_base_fees', mint), quoteFees: pda(KYDOS, 'dbc_quote_fees', mint),
    baseVault: pda(DBC, 'token_vault', mint, dbcPool), quoteVault: pda(DBC, 'token_vault', NATIVE_MINT, dbcPool),
    tokenAVault: pda(DAMM, 'token_vault', mint, pool), tokenBVault: pda(DAMM, 'token_vault', NATIVE_MINT, pool),
    metadata: pda(METADATA, 'metadata', METADATA, mint) };
}

/** Public release manifest, not a signing key. Mainnet remains explicitly closed. */
export function validateDbcRelease(input) {
  requireValue(input?.enabled === true, 'DBC transactions are disabled until a verified release manifest is supplied.');
  requireValue(input.genesisHash === DEVNET, 'This DBC browser milestone is devnet-only; mainnet is not enabled.');
  const config = pk(input.config).toBase58();
  const hashes = {};
  for (const program of [KYDOS, DBC, DAMM, METADATA]) {
    const key = program.toBase58(), hash = input.programDataHashes?.[key];
    requireValue(typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash), `Missing verified ProgramData hash for ${key}`);
    hashes[key] = hash;
  }
  return Object.freeze({ enabled: true, genesisHash: DEVNET, config, programDataHashes: Object.freeze(hashes) });
}
export async function verifyDbcConfig(info) {
  const d = await externalData(info, DBC, 'PoolConfig', 1048);
  requireValue(equal(keyAt(d, 8), NATIVE_MINT) && equal(keyAt(d, 40), feeAuthority()) &&
    equal(keyAt(d, 72), feeAuthority()), 'DBC configuration must put fee and leftover rights in Kydos PDA custody');
  requireValue(await sha256(d.subarray(104)) === POLICY_HASH, 'Unapproved DBC economic policy');
  return true;
}
export async function verifyDbcRelease(connection, input) {
  const release = validateDbcRelease(input);
  requireValue(await connection.getGenesisHash() === release.genesisHash, 'RPC network does not match the reviewed DBC release');
  // Check complete loader accounts, including deployment slot and upgrade authority.
  // No cache is used across reviews/signing. Upstream changes require a new review.
  for (const program of [KYDOS, DBC, DAMM, METADATA]) {
    const info = await connection.getAccountInfo(program, 'confirmed');
    requireValue(info?.executable && equal(info.owner, UPGRADEABLE_LOADER), 'Expected an upgradeable executable program');
    const d = Buffer.from(info.data);
    const programData = pda(UPGRADEABLE_LOADER, program);
    requireValue(d.length === 36 && d.readUInt32LE(0) === 2 && equal(keyAt(d, 4), programData), 'Invalid program loader binding');
    const deployed = await connection.getAccountInfo(programData, 'confirmed');
    requireValue(deployed && !deployed.executable && equal(deployed.owner, UPGRADEABLE_LOADER), 'Invalid ProgramData owner');
    const bytes = Buffer.from(deployed.data);
    requireValue(bytes.length > 45 && bytes.readUInt32LE(0) === 3 && bytes[12] <= 1, 'Invalid ProgramData layout');
    requireValue(await sha256(bytes) === release.programDataHashes[program.toBase58()], 'Deployed program changed or does not match the verified release');
  }
  await verifyDbcConfig(await connection.getAccountInfo(pk(release.config), 'confirmed'));
  requireValue(await connection.getGenesisHash() === release.genesisHash, 'RPC network changed during verification');
  return release;
}

export function decodeDbcLaunch(info, mint, config) {
  requireValue(info && !info.executable && equal(info.owner, KYDOS), 'Not a registered Kydos DBC launch');
  requireValue(info.data.length === LAUNCH_SIZE, 'Unsupported DBC launch record');
  const record = coder.decode('dbcLaunch', Buffer.from(info.data));
  const a = dbcAddresses(mint, config);
  requireValue(record.version === 1 && record.bump === a.bump && equal(record.mint, a.mint) && equal(record.config, a.config) &&
    equal(record.dbcPool, a.dbcPool) && equal(record.dammPool, a.pool), 'DBC registry bindings do not match this mint and release');
  const integer = name => BigInt(record[name].toString());
  requireValue(integer('quoteDust') <= 1n, 'Invalid protected quote dust');
  return Object.freeze({ ...a, creator: pk(record.creator), quoteDust: integer('quoteDust'),
    baseBurned: integer('baseBurned'), creatorQuotePaid: integer('creatorQuotePaid'),
    kydosQuotePaid: integer('kydosQuotePaid'), bondingQuotePaid: integer('bondingQuotePaid') });
}
export async function readDbcLaunch(connection, mint, config) {
  const a = dbcAddresses(mint, config);
  const record = decodeDbcLaunch(await connection.getAccountInfo(a.launch, 'confirmed'), a.mint, a.config);
  const m = unpackMint(a.mint, await connection.getAccountInfo(a.mint, 'confirmed'), TOKEN_PROGRAM_ID);
  requireValue(m.isInitialized && m.decimals === 6 && !m.mintAuthority && !m.freezeAuthority, 'Invalid launched token mint');
  const d = await externalData(await connection.getAccountInfo(a.dbcPool, 'confirmed'), DBC, 'VirtualPool', 424);
  requireValue(equal(keyAt(d, 72), a.config) && equal(keyAt(d, 136), a.mint) && equal(keyAt(d, 168), a.baseVault) &&
    equal(keyAt(d, 200), a.quoteVault) && d[304] === 0 && d[308] <= 3, 'Invalid DBC pool binding');
  const stage = d[308] === 3 ? 'migrated' : d.readBigUInt64LE(240) >= 85005359057n ? 'awaiting-migration' : 'bonding';
  return Object.freeze({ ...record, stage });
}

/** Pool-scoped discovery only. No unbounded global launch/NFT scans. */
export async function readDbcPositions(connection, record) {
  requireValue(record.stage === 'migrated', 'The DBC pool has not migrated');
  const result = await connection.getProgramAccounts(DAMM, { commitment: 'confirmed',
    filters: [{ dataSize: 408 }, { memcmp: { offset: 8, bytes: record.pool.toBase58() } }] });
  requireValue(Array.isArray(result) && result.length <= 32, 'Too many positions for browser discovery; use an indexed position list');
  const positions = [];
  for (const entry of result) {
    const d = await externalData(entry.account, DAMM, 'Position', 408);
    const nft = keyAt(d, 40);
    requireValue(equal(keyAt(d, 8), record.pool) && equal(entry.pubkey, positionAddress(nft)), 'Substituted DAMM position');
    if (u128(d, 152) !== 0n || u128(d, 168) !== 0n || u128(d, 184) === 0n || d.subarray(392, 396).some(Boolean)) continue;
    const address = positionNftAccount(nft), info = await connection.getAccountInfo(address, 'confirmed');
    if (!info || info.executable || !equal(info.owner, TOKEN_2022_PROGRAM_ID)) continue;
    const token = unpackAccount(address, info, TOKEN_2022_PROGRAM_ID);
    if (!token.isInitialized || token.isFrozen || !equal(token.mint, nft) || !equal(token.owner, feeAuthority()) ||
      token.amount !== 1n || token.delegate || token.delegatedAmount !== 0n || token.closeAuthority) continue;
    positions.push(Object.freeze({ nft: nft.toBase58(), position: entry.pubkey.toBase58(), permanentLiquidity: u128(d, 184) }));
  }
  return Object.freeze(positions);
}

/** Read-only Program instance; instruction() cannot ask Phantom or send a tx. */
export function dbcProgram(connection) { return new Program(compiledIdl, { connection }); }
export async function dbcLaunchInstruction({ connection, payer, mint, config, name, symbol, metadataUri, initialBuyLamports = 0n }) {
  requireValue(initialBuyLamports === 0n, 'Initial purchases are not implemented by the DBC browser yet; no purchase is silently omitted');
  validateLaunch({ name, symbol, metadataUri });
  const a = dbcAddresses(mint, config);
  return dbcProgram(connection).methods.launchDbc({ name, symbol, uri: metadataUri }).accountsStrict({
    payer: pk(payer), creator: pk(payer), mint: a.mint, config: a.config, launch: a.launch, quoteMint: NATIVE_MINT,
    pool: a.dbcPool, baseVault: a.baseVault, quoteVault: a.quoteVault, metadata: a.metadata,
    poolAuthority: pda(DBC, 'pool_authority'), dbcProgram: DBC, eventAuthority: eventAuthority(DBC),
    metadataProgram: METADATA, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction();
}
export async function dbcFeeInstruction({ connection, payer, record, source, nft }) {
  requireValue(['bonding', 'damm'].includes(source), 'Unsupported fee source');
  const a = dbcAddresses(record.mint, record.config);
  const fees = { payer: pk(payer), launch: a.launch, mint: a.mint, quoteMint: NATIVE_MINT, config: a.config,
    dbcPool: a.dbcPool, feeAuthority: a.feeAuthority, baseFees: a.baseFees, quoteFees: a.quoteFees,
    creatorQuote: recipientAta(record.creator), treasuryQuote: recipientAta(TREASURY),
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId };
  const program = dbcProgram(connection);
  if (source === 'bonding') return program.methods.claimDbcFees().accountsStrict({ fees,
    baseVault: a.baseVault, quoteVault: a.quoteVault, poolAuthority: pda(DBC, 'pool_authority'),
    eventAuthority: eventAuthority(DBC), dbcProgram: DBC }).instruction();
  requireValue(record.stage === 'migrated', 'Wait for verified DAMM migration before settling fees');
  const key = pk(nft);
  return program.methods.settleDammFees().accountsStrict({ fees, pool: a.pool, position: positionAddress(key),
    positionNftMint: key, positionNftAccount: positionNftAccount(key), tokenAVault: a.tokenAVault,
    tokenBVault: a.tokenBVault, poolAuthority: pda(DAMM, 'pool_authority'), eventAuthority: eventAuthority(DAMM), dammProgram: DAMM }).instruction();
}
export function withDbcRecipients(instruction, payer, creator) {
  const transaction = new Transaction();
  for (const owner of new Set([pk(creator).toBase58(), TREASURY.toBase58()])) {
    transaction.add(createAssociatedTokenAccountIdempotentInstruction(pk(payer), recipientAta(owner), pk(owner), NATIVE_MINT));
  }
  return transaction.add(instruction);
}
export function formatDbcAmount(value, decimals = 9) {
  requireValue(Number.isInteger(decimals) && decimals >= 0 && decimals <= 9, 'Invalid display decimals');
  requireValue(typeof value === 'bigint' && value >= 0n, 'Expected nonnegative integer amount');
  const text = value.toString().padStart(decimals + 1, '0');
  if (!decimals) return text;
  const fraction = text.slice(-decimals).replace(/0+$/, '');
  return text.slice(0, -decimals) + (fraction ? `.${fraction}` : '');
}
