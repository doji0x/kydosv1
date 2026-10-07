/** Unsigned instruction builders only. Wallet approval/submission are separate.
 * The program independently validates every account and payout destination.
 * WSOL payouts are deliberate: no caller can close a fee/dust vault.
 */
import { PublicKey, Transaction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import * as sdk from '@meteora-ag/dynamic-bonding-curve-sdk';

export const KYDOS_PROGRAM = new PublicKey('GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE');
export const TREASURY = new PublicKey('5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg');
export const DAMM_PROGRAM = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');
export const DBC_PROGRAM = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const METADATA = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const event = program => PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],program)[0];
const local = (seed, mint) => PublicKey.findProgramAddressSync(
  mint ? [Buffer.from(seed),new PublicKey(mint).toBuffer()] : [Buffer.from(seed)],KYDOS_PROGRAM)[0];
export const feeAuthority = () => local('dbc_fee_authority');
export function feeAddresses(mint, config) {
  mint=new PublicKey(mint); config=new PublicKey(config);
  const dbcPool=sdk.deriveDbcPoolAddress(NATIVE_MINT,mint,config);
  const dammConfig=sdk.DAMM_V2_MIGRATION_FEE_ADDRESS[sdk.MigrationFeeOption.Customizable];
  const pool=sdk.deriveDammV2PoolAddress(dammConfig,mint,NATIVE_MINT);
  return {mint,config,dbcPool,pool,launch:local('dbc_launch',mint),feeAuthority:feeAuthority(),
    baseFees:local('dbc_base_fees',mint),quoteFees:local('dbc_quote_fees',mint),
    baseVault:sdk.deriveDbcTokenVaultAddress(dbcPool,mint),quoteVault:sdk.deriveDbcTokenVaultAddress(dbcPool,NATIVE_MINT),
    tokenAVault:sdk.deriveDammV2TokenVaultAddress(pool,mint),tokenBVault:sdk.deriveDammV2TokenVaultAddress(pool,NATIVE_MINT)};
}
function requireProgram(program) {
  if (!program.programId.equals(KYDOS_PROGRAM)) throw new Error('Wrong Kydos program ID');
}
export async function launchDbcInstruction({ program,payer,creator,mint,config,metadata }) {
  requireProgram(program); const a=feeAddresses(mint,config);
  return program.methods.launchDbc(metadata).accountsStrict({payer,creator,mint:a.mint,config:a.config,
    launch:a.launch,quoteMint:NATIVE_MINT,pool:a.dbcPool,baseVault:a.baseVault,quoteVault:a.quoteVault,
    metadata:sdk.deriveMintMetadata(a.mint),poolAuthority:sdk.deriveDbcPoolAuthority(),dbcProgram:DBC_PROGRAM,
    eventAuthority:event(DBC_PROGRAM),metadataProgram:METADATA,tokenProgram:TOKEN_PROGRAM_ID,systemProgram:SYSTEM}).instruction();
}
function common(a,payer,creator) {
  return {payer,launch:a.launch,mint:a.mint,quoteMint:NATIVE_MINT,config:a.config,dbcPool:a.dbcPool,
    feeAuthority:a.feeAuthority,baseFees:a.baseFees,quoteFees:a.quoteFees,
    creatorQuote:getAssociatedTokenAddressSync(NATIVE_MINT,new PublicKey(creator),true),
    treasuryQuote:getAssociatedTokenAddressSync(NATIVE_MINT,TREASURY,true),tokenProgram:TOKEN_PROGRAM_ID,systemProgram:SYSTEM};
}
export async function settleDammInstruction({program,payer,creator,mint,config,positionNftMint}) {
  requireProgram(program); const a=feeAddresses(mint,config);const nft=new PublicKey(positionNftMint);
  return program.methods.settleDammFees().accountsStrict({fees:common(a,payer,creator),pool:a.pool,
    position:sdk.derivePositionAddress(nft),positionNftMint:nft,positionNftAccount:sdk.derivePositionNftAccount(nft),
    tokenAVault:a.tokenAVault,tokenBVault:a.tokenBVault,poolAuthority:sdk.deriveDammV2PoolAuthority(),
    eventAuthority:event(DAMM_PROGRAM),dammProgram:DAMM_PROGRAM}).instruction();
}
export async function claimDbcInstruction({program,payer,creator,mint,config}) {
  requireProgram(program);const a=feeAddresses(mint,config);
  return program.methods.claimDbcFees().accountsStrict({fees:common(a,payer,creator),
    baseVault:a.baseVault,quoteVault:a.quoteVault,poolAuthority:sdk.deriveDbcPoolAuthority(),
    eventAuthority:event(DBC_PROGRAM),dbcProgram:DBC_PROGRAM}).instruction();
}
/** Recipient ATA setup is separately sponsored; it never debits collected fees. */
export function withRecipientAccounts(instruction,payer,creator) {
  const tx=new Transaction();const seen=new Set();
  for(const owner of [new PublicKey(creator),TREASURY]){
    if(seen.has(owner.toBase58()))continue;seen.add(owner.toBase58());
    const ata=getAssociatedTokenAddressSync(NATIVE_MINT,owner,true);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(payer,ata,owner,NATIVE_MINT));
  }
  return tx.add(instruction);
}
