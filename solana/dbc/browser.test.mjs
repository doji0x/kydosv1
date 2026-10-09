/** Differential checks against the unchanged, isolated DBC SDK 1.5.13 lock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Keypair, Connection } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import * as sdk from '@meteora-ag/dynamic-bonding-curve-sdk';
import * as browser from '../../src/lib/solana/dbcBrowser.js';
const equal = (a,b) => assert.equal(a.toBase58(),b.toBase58());

test('browser PDAs match SDK for both mint orders without bundling an SDK into the app',()=>{
  const config=Keypair.generate().publicKey;let above=false,below=false;
  for(let i=0;i<64;i++){
    const mint=Keypair.fromSeed(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).publicKey;
    above ||= Buffer.compare(mint.toBuffer(),NATIVE_MINT.toBuffer())>0;
    below ||= Buffer.compare(mint.toBuffer(),NATIVE_MINT.toBuffer())<0;
    const a=browser.dbcAddresses(mint,config);
    equal(a.dbcPool,sdk.deriveDbcPoolAddress(NATIVE_MINT,mint,config));
    equal(a.pool,sdk.deriveDammV2PoolAddress(sdk.DAMM_V2_MIGRATION_FEE_ADDRESS[sdk.MigrationFeeOption.Customizable],mint,NATIVE_MINT));
    equal(a.baseVault,sdk.deriveDbcTokenVaultAddress(a.dbcPool,mint));equal(a.quoteVault,sdk.deriveDbcTokenVaultAddress(a.dbcPool,NATIVE_MINT));
    equal(a.tokenAVault,sdk.deriveDammV2TokenVaultAddress(a.pool,mint));equal(a.tokenBVault,sdk.deriveDammV2TokenVaultAddress(a.pool,NATIVE_MINT));
    equal(a.metadata,sdk.deriveMintMetadata(mint));equal(browser.positionAddress(mint),sdk.derivePositionAddress(mint));
    equal(browser.positionNftAccount(mint),sdk.derivePositionNftAccount(mint));
  }
  assert(above&&below,'exercise each ordering');
});
test('captured full config, graduation threshold and zero pool-creation levy match SDK decoding',async()=>{
  const connection=new Connection('http://127.0.0.1:1');
  const client=new sdk.DynamicBondingCurveClient(connection,'confirmed');
  const bytes=readFileSync(new URL('./fixtures/controller-config.bin',import.meta.url));
  const config=client.state.program.coder.accounts.decode('poolConfig',bytes);
  equal(config.feeClaimer,browser.feeAuthority());equal(config.leftoverReceiver,browser.feeAuthority());equal(config.quoteMint,NATIVE_MINT);
  assert.equal(config.poolCreationFee.toString(),'0');assert.equal(config.migrationQuoteThreshold.toString(),'85005359057');
  assert.equal(config.preMigrationTokenSupply.toString(),'1000000000000000');
  assert.equal(config.partnerPermanentLockedLiquidityPercentage,100);assert.equal(config.creatorTradingFeePercentage,0);
  await browser.verifyDbcConfig({owner:browser.DBC,executable:false,data:bytes});
});
test('fixed CPI authorities and DBC layout used by browser match pinned SDK',async()=>{
  const connection=new Connection('http://127.0.0.1:1');const payer=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,config=Keypair.generate().publicKey;
  const ix=await browser.dbcLaunchInstruction({connection,payer,mint,config,name:'SDK test',symbol:'SDK',metadataUri:'https://example.com/test.json'});
  equal(ix.keys[10].pubkey,sdk.deriveDbcPoolAuthority());equal(browser.eventAuthority(browser.DBC),sdk.deriveDbcEventAuthority());
  equal(browser.eventAuthority(browser.DAMM),sdk.deriveDammV2EventAuthority());
  const a=browser.dbcAddresses(mint,config),r={...a,stage:'migrated',creator:payer};
  const settle=await browser.dbcFeeInstruction({connection,payer,record:r,source:'damm',nft:mint});
  assert(settle.keys.some(k=>k.pubkey.equals(sdk.deriveDammV2PoolAuthority())));
  const client=new sdk.DynamicBondingCurveClient(connection,'confirmed');
  const data=Buffer.alloc(424);const discriminator=client.state.program.idl.accounts.find(a=>a.name==='virtualPool').discriminator;
  Buffer.from(discriminator).copy(data);a.config.toBuffer().copy(data,72);a.mint.toBuffer().copy(data,136);
  a.baseVault.toBuffer().copy(data,168);a.quoteVault.toBuffer().copy(data,200);data[308]=3;data.writeBigUInt64LE(85005359057n,240);
  const decoded=client.state.program.coder.accounts.decode('virtualPool',data).poolState;
  equal(decoded.config,config);equal(decoded.baseMint,mint);equal(decoded.baseVault,a.baseVault);equal(decoded.quoteVault,a.quoteVault);
  assert.equal(decoded.quoteReserve.toString(),'85005359057');assert.equal(decoded.migrationProgress,3);
});
