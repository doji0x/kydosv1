import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {Program} from '@coral-xyz/anchor';import {Connection,PublicKey} from '@solana/web3.js';
import {NATIVE_MINT,getAssociatedTokenAddressSync} from '@solana/spl-token';
import * as sdk from '@meteora-ag/dynamic-bonding-curve-sdk';
import {feeAuthority,feeAddresses,launchDbcInstruction,settleDammInstruction,claimDbcInstruction,withRecipientAccounts,KYDOS_PROGRAM,TREASURY} from './fee-controller.mjs';
const browserText=readFileSync(new URL('../../src/lib/solana/idl/kydos_launchpad.json',import.meta.url),'utf8');
const idl=JSON.parse(browserText);
const connection=new Connection('http://127.0.0.1:1');let rpc=0;connection._rpcRequest=async()=>{rpc++;throw new Error('No RPC permitted');};connection._rpcBatchRequest=connection._rpcRequest;
const program=new Program(idl,{connection});const pk=i=>new PublicKey(new Uint8Array(32).fill(i));
const args={program,payer:pk(1),creator:pk(2),mint:pk(3),config:pk(4),positionNftMint:pk(5)};

test('compiler-generated interface equals the checked-in browser IDL',()=>{
 const generated=JSON.parse(readFileSync(new URL('../target/idl/kydos_launchpad.json',import.meta.url)));
 assert.deepEqual(new Program(generated,{connection}).idl,idl);assert.equal(idl.address,KYDOS_PROGRAM.toBase58());
});
test('browser IDL retains sync-idl canonical formatting as well as identical values',()=>{
 assert.equal(browserText,JSON.stringify(program.idl,null,2)+'\n');
});
test('launch builder signs neither the transaction nor the internal fee authority',async()=>{
 const metadata={name:'Test',symbol:'TEST',uri:'https://example.invalid/test.json'};
 const ix=await launchDbcInstruction({...args,metadata});const decoded=program.coder.instruction.decode(ix.data);
 assert.equal(decoded.name,'launchDbc');assert.deepEqual(decoded.data.metadata,metadata);
 assert.deepEqual(ix.keys.filter(k=>k.isSigner).map(k=>k.pubkey.toBase58()).sort(),[args.payer,args.creator,args.mint].map(k=>k.toBase58()).sort());assert.equal(rpc,0);
});
test('fee authority and vaults are isolated from the treasury and each other',()=>{
 const a=feeAddresses(args.mint,args.config),other=feeAddresses(pk(8),args.config);
 assert.equal(new Set([a.launch,a.baseFees,a.quoteFees,a.feeAuthority,TREASURY].map(k=>k.toBase58())).size,5);
 assert.notEqual(a.quoteFees.toBase58(),other.quoteFees.toBase58());assert.equal(a.feeAuthority.toBase58(),other.feeAuthority.toBase58());
});
test('fee builders require only sponsor signature and target fixed Kydos code',async()=>{
 for(const ix of[await settleDammInstruction(args),await claimDbcInstruction(args)]){
  assert.equal(ix.programId.toBase58(),KYDOS_PROGRAM.toBase58());assert.deepEqual(ix.keys.filter(k=>k.isSigner).map(k=>k.pubkey.toBase58()),[args.payer.toBase58()]);
  assert.ok(!ix.keys.some(k=>k.pubkey.equals(feeAuthority())&&k.isSigner));
 }assert.equal(rpc,0);
});
test('recipient account setup never closes custody or deducts execution fees',async()=>{
 const ix=await settleDammInstruction(args);const tx=withRecipientAccounts(ix,args.payer,args.creator);
 assert.equal(tx.instructions.length,3);assert.equal(tx.signatures.length,0);
 assert.ok(ix.keys.some(k=>k.pubkey.equals(getAssociatedTokenAddressSync(NATIVE_MINT,TREASURY,true))));
 const same=withRecipientAccounts(ix,args.payer,TREASURY);assert.equal(same.instructions.length,2);
});
test('builders fail closed against a different program ID',async()=>{
 await assert.rejects(launchDbcInstruction({...args,program:{programId:pk(9)}}),/Wrong/);
 await assert.rejects(settleDammInstruction({...args,program:{programId:pk(9)}}),/Wrong/);
});
test('Rust policy fingerprint matches executed config fixture and actual SDK decoding',()=>{
 const fixture=readFileSync(new URL('./fixtures/controller-config.bin',import.meta.url));
 const rust=readFileSync(new URL('../programs/kydos_launchpad/src/dbc_fees.rs',import.meta.url),'utf8');
 const raw=rust.match(/CONFIG_POLICY_HASH: \[u8;32\] = \[([^\]]+)\]/)[1].split(',').map(Number);
 assert.deepEqual(Buffer.from(raw),createHash('sha256').update(fixture.subarray(104)).digest());
 const decoded=sdk.DynamicBondingCurveClient.create(connection,'confirmed').partner.program.coder.accounts.decode('poolConfig',fixture);
 assert.equal(decoded.feeClaimer.toBase58(),feeAuthority().toBase58());assert.equal(decoded.leftoverReceiver.toBase58(),feeAuthority().toBase58());
 assert.equal(decoded.swapBaseAmount.toString(),'793100000000000');assert.equal(decoded.migrationBaseThreshold.toString(),'206900000000000');assert.equal(decoded.partnerPermanentLockedLiquidityPercentage,100);
});
