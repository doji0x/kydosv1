// Operator setup and read-only evidence. This module never signs or sends transactions.
import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ADDRESS } from '../../../base44/shared/solanaProtocol.js';
import { SOLANA_NETWORKS, identifySolanaNetwork } from '../../../base44/shared/solanaNetwork.js';
import { DAMM_PROGRAM_ID, CONFIG_SPACE, CONFIG_DISCRIMINATOR, deriveConfigAddress,
  validatePrivateConfig } from '../../../src/lib/solana/meteora.js';

const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
export const creatorAuthority = PublicKey.findProgramAddressSync(
  [Buffer.from('meteora_pool_creator')], new PublicKey(PROGRAM_ADDRESS))[0];

export function networkFor(cluster) {
  const entry = Object.entries(SOLANA_NETWORKS).find(([, network]) => network.cluster === cluster);
  if (!entry) throw new Error('Cluster must be mainnet-beta or devnet');
  return { cluster, genesisHash: entry[0] };
}

export function configIndex(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)
      || BigInt(value) > (1n << 64n) - 1n) throw new Error('Config index must be a decimal u64 string');
  return BigInt(value);
}

export function prepareConfigRequest(cluster, index = null) {
  const network = networkFor(cluster);
  return {
    schemaVersion: 1, ...network,
    launchpadProgram: PROGRAM_ADDRESS, dammProgram: DAMM_PROGRAM_ID.toBase58(),
    poolCreatorAuthority: creatorAuthority.toBase58(),
    instruction: 'create_dynamic_config',
    index, config: index === null ? null : deriveConfigAddress(configIndex(index)).toBase58(),
    configParameters: { poolCreatorAuthority: creatorAuthority.toBase58(), permission: '0' },
    requiredOperatorPermission: 'CreateConfigKey',
    operatorAction: 'Choose an unused config index, provision on the specified cluster, and return the index, config address and transaction signature.',
    funding: 'Operator signer and rent payer sign creation. Kydos creator PDA does not sign config creation.',
    migrationEnabled: false,
  };
}

function requireExecutable(account, label) {
  if (!account?.executable || !account.owner.equals(LOADER)) {
    throw new Error(`${label} must be an executable upgradeable-loader program on the selected cluster`);
  }
}

export async function verifyConfig(connection, cluster, configAddress) {
  const expected = networkFor(cluster);
  const genesisHash = await connection.getGenesisHash();
  if (identifySolanaNetwork(genesisHash).cluster !== cluster) throw new Error('RPC cluster mismatch');
  const address = new PublicKey(configAddress);
  const { context, value } = await connection.getMultipleAccountsInfoAndContext(
    [new PublicKey(PROGRAM_ADDRESS), DAMM_PROGRAM_ID, address], { commitment: 'finalized' });
  requireExecutable(value[0], 'Kydos');
  requireExecutable(value[1], 'Meteora');
  // Candidate validation is evidence, not approval. checkApprovedRoute supplies the
  // committed address separately; an RPC discovery never writes that registry.
  const result = validatePrivateConfig({ address, account: value[2], approvedConfig: address,
    creatorAuthority });
  const binding = {
    ...expected, launchpadProgram: PROGRAM_ADDRESS, dammProgram: DAMM_PROGRAM_ID.toBase58(),
    poolCreatorAuthority: creatorAuthority.toBase58(), config: address.toBase58(),
    index: result.index.toString(), accountDataSha256: createHash('sha256').update(value[2].data).digest('hex'),
  };
  return { schemaVersion: 1, verifiedSlot: context.slot, commitment: 'finalized',
    candidateValid: true, approved: false, migrationEnabled: false, proposedBinding: binding };
}

export async function discoverConfigs(connection, cluster) {
  networkFor(cluster);
  if (identifySolanaNetwork(await connection.getGenesisHash()).cluster !== cluster) throw new Error('RPC cluster mismatch');
  const result = await connection.getProgramAccounts(DAMM_PROGRAM_ID, {
    commitment: 'finalized', withContext: true,
    filters: [{ dataSize: CONFIG_SPACE },
      { memcmp: { offset: 0, bytes: CONFIG_DISCRIMINATOR.toString('base64'), encoding: 'base64' } },
      { memcmp: { offset: 40, bytes: creatorAuthority.toBase58() } }],
  });
  const candidates = result.value.map(({ pubkey, account }) => {
    const valid = validatePrivateConfig({ address: pubkey, account, approvedConfig: pubkey, creatorAuthority });
    return { config: pubkey.toBase58(), index: valid.index.toString() };
  });
  return { ...networkFor(cluster), observedSlot: result.context.slot,
    poolCreatorAuthority: creatorAuthority.toBase58(), candidates, approved: false, migrationEnabled: false };
}

export async function checkApprovedRoute(connection, cluster, registry) {
  const network = networkFor(cluster);
  if (registry?.schemaVersion !== 1) throw new Error('Unsupported route registry');
  const approved = registry.routes?.[cluster];
  if (!approved) throw new Error(`No approved private config for ${cluster}; migration remains disabled`);
  for (const [field, expected] of Object.entries({ ...network, launchpadProgram: PROGRAM_ADDRESS,
    dammProgram: DAMM_PROGRAM_ID.toBase58(), poolCreatorAuthority: creatorAuthority.toBase58() })) {
    if (approved[field] !== expected) throw new Error(`Approved route ${field} mismatch`);
  }
  if (deriveConfigAddress(configIndex(approved.index)).toBase58() !== approved.config) throw new Error('Approved route index/address mismatch');
  if (!/^[a-f0-9]{64}$/.test(approved.accountDataSha256)) throw new Error('Approved route requires an account-data hash');
  const report = await verifyConfig(connection, cluster, approved.config);
  if (report.proposedBinding.accountDataSha256 !== approved.accountDataSha256) throw new Error('Approved config account data changed');
  return { ...report, approved: true, migrationEnabled: false };
}
