/** Built Kydos controller + pinned Meteora programs; disposable loopback ONLY.
 * Wallets and the DBC-owned DAMM config are local fixtures, not live deployment.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,openSync,closeSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,SystemProgram,Transaction,ComputeBudgetProgram} from '@solana/web3.js';
import {Program} from '@coral-xyz/anchor';
import {NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,getMint,getAccount,getAssociatedTokenAddressSync,
 createAssociatedTokenAccountIdempotentInstruction,createSyncNativeInstruction,createCloseAccountInstruction,
 createTransferCheckedInstruction} from '@solana/spl-token';
import BN from 'bn.js';import * as sdk from '@meteora-ag/dynamic-bonding-curve-sdk';
import {buildCandidateParameters} from './candidate.mjs';
import {feeAuthority,feeAddresses,launchDbcInstruction,settleDammInstruction,claimDbcInstruction,
 withRecipientAccounts,KYDOS_PROGRAM,TREASURY,DAMM_PROGRAM,DBC_PROGRAM} from './fee-controller.mjs';

if(process.argv.length!==2)throw new Error('No arguments or network endpoint accepted');
const c=new Connection('http://127.0.0.1:18899','confirmed');
assert.equal(c.rpcEndpoint,'http://127.0.0.1:18899');
const program=new Program(JSON.parse(readFileSync('../target/idl/kydos_launchpad.json')),{connection:c});
const dbc=sdk.DynamicBondingCurveClient.create(c,'confirmed'),amm=sdk.createDammV2Program(c);
const payer=Keypair.generate(),creator=Keypair.generate(),newCreator=Keypair.generate(),trader=Keypair.generate(),sponsor=Keypair.generate();
const bn=x=>new BN(x.toString()),int=x=>BigInt(x.toString());
const dir=mkdtempSync(join(tmpdir(),'kydos-dbc-fees-')),out=resolve('fee-results');mkdirSync(out,{recursive:true});
const fd=openSync(join(dir,'validator.log'),'w');const genesisArgs=[];
function genesis(name,key,data,owner,lamports=100000000){const p=join(dir,name+'.json');writeFileSync(p,JSON.stringify({pubkey:key.toBase58(),account:{lamports,data:[data.toString('base64'),'base64'],owner:owner.toBase58(),executable:false,rentEpoch:0}}));genesisArgs.push('--account',key.toBase58(),p);}
for(const [i,k]of[payer,creator,newCreator,trader,sponsor].entries())genesis('wallet'+i,k.publicKey,Buffer.alloc(0),SystemProgram.programId,2000e9);
const migrationConfig=sdk.DAMM_V2_MIGRATION_FEE_ADDRESS[sdk.MigrationFeeOption.Customizable];
const cb=Buffer.alloc(328);createHash('sha256').update('account:Config').digest().copy(cb,0,0,8);sdk.deriveDbcPoolAuthority().toBuffer().copy(cb,40);cb[202]=1;
genesis('dbc-owned-damm-config',migrationConfig,cb,DAMM_PROGRAM);
genesis('flash-rent',sdk.deriveDbcPoolAuthority(),Buffer.alloc(0),SystemProgram.programId,1e9);
const pins={'dynamic_bonding_curve.so':'7fd83fbd3553fce004fb7af73ec230aa6d0a3360','cp_amm.so':'946562cfc35b978dbaf1100363b7505b018fd6f6','metaplex.so':'5da6f4fa684bd01fc15a7d20eca754a11d247348'};
for(const [name,pin]of Object.entries(pins)){const b=readFileSync('runtime/fixtures/'+name);assert.equal(createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'),pin);}
let child,sequence=0,error;const passes=[],measurements=[];
const pass=text=>{passes.push(text);console.log('PASS '+text);};
async function send(transaction,signers=[payer],success=true,invoked){
 const latest=await c.getLatestBlockhash();const tx=new Transaction({...latest,feePayer:signers[0].publicKey})
  .add(ComputeBudgetProgram.setComputeUnitLimit({units:1000000+(++sequence)}),ComputeBudgetProgram.requestHeapFrame({bytes:256*1024}),...transaction.instructions.filter(i=>!i.programId.equals(ComputeBudgetProgram.programId)));
 tx.sign(...signers);const bytes=tx.serialize();assert.ok(bytes.length<=1232,'packet too large');
 const signature=await c.sendRawTransaction(bytes,{skipPreflight:true,maxRetries:2});
 for(let i=0;i<200;i++){
  const status=(await c.getSignatureStatuses([signature])).value[0];
  if(['confirmed','finalized'].includes(status?.confirmationStatus)){
   const result=await c.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
   if(result?.meta){assert.deepEqual(status.err,result.meta.err);
    if(invoked)assert.ok(result.meta.logMessages.some(l=>l.includes(`Program ${invoked} invoke`)),'program not invoked');
    if(success)assert.equal(result.meta.err,null,JSON.stringify(result.meta.logMessages));else assert.ok(result.meta.err,'rejection unexpectedly succeeded');
    measurements.push({bytes:bytes.length,computeUnits:result.meta.computeUnitsConsumed,success:!result.meta.err});return result;
   }
  }
  if(!status&&await c.getBlockHeight()>latest.lastValidBlockHeight)throw new Error('transaction expired, not a program rejection');
  await delay(100);
 }
 throw new Error('confirmation timeout');
}
async function snapshot(keys){return(await c.getMultipleAccountsInfo(keys)).map(a=>a?{owner:a.owner.toBase58(),lamports:a.lamports,data:a.data.toString('base64')}:null);}
async function rejected(name,tx,signers,keys){const before=await snapshot(keys);const r=await send(tx,signers,false,KYDOS_PROGRAM);assert.deepEqual(await snapshot(keys),before);pass(name);return r;}
function event(result){const items=result.meta.logMessages.filter(l=>l.startsWith('Program data: ')).map(l=>{try{return program.coder.events.decode(l.slice(14));}catch{return null;}}).filter(Boolean);return items.find(e=>e.name==='dbcFeesSettled')?.data;}
const config=Keypair.generate(),mint=Keypair.generate(),a=feeAddresses(mint.publicKey,config.publicKey);
const creatorAta=getAssociatedTokenAddressSync(NATIVE_MINT,creator.publicKey),treasuryAta=getAssociatedTokenAddressSync(NATIVE_MINT,TREASURY);
const baseTrader=getAssociatedTokenAddressSync(mint.publicKey,trader.publicKey),wsolTrader=getAssociatedTokenAddressSync(NATIVE_MINT,trader.publicKey);
let positionMint;
const claimArgs=()=>({program,payer:sponsor.publicKey,creator:creator.publicKey,mint:mint.publicKey,config:config.publicKey});
const settleTx=async(overrides={})=>withRecipientAccounts(await settleDammInstruction({...claimArgs(),positionNftMint:positionMint,...overrides}),sponsor.publicKey,overrides.creator??creator.publicKey);
async function dbcSwap(isSell,input,mode=sdk.SwapMode.ExactIn){const tx=await dbc.pool.swap2({pool:a.dbcPool,swapBaseForQuote:isSell,swapMode:mode,owner:trader.publicKey,referralTokenAccount:null,amountIn:bn(input),minimumAmountOut:bn(1)});return send(tx,[trader],true,DBC_PROGRAM);}
async function ammSwap(isSell,input){const tx=new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(trader.publicKey,wsolTrader,trader.publicKey,NATIVE_MINT));
 if(!isSell)tx.add(SystemProgram.transfer({fromPubkey:trader.publicKey,toPubkey:wsolTrader,lamports:input}),createSyncNativeInstruction(wsolTrader));
 tx.add(await amm.methods.swap({amountIn:bn(input),minimumAmountOut:bn(1)}).accountsStrict({poolAuthority:sdk.deriveDammV2PoolAuthority(),pool:a.pool,
 inputTokenAccount:isSell?baseTrader:wsolTrader,outputTokenAccount:isSell?wsolTrader:baseTrader,tokenAVault:a.tokenAVault,tokenBVault:a.tokenBVault,tokenAMint:mint.publicKey,tokenBMint:NATIVE_MINT,
 payer:trader.publicKey,tokenAProgram:TOKEN_PROGRAM_ID,tokenBProgram:TOKEN_PROGRAM_ID,referralTokenAccount:null,eventAuthority:PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],DAMM_PROGRAM)[0],program:DAMM_PROGRAM}).instruction());
 tx.add(createCloseAccountInstruction(wsolTrader,trader.publicKey,trader.publicKey));return send(tx,[trader],true,DAMM_PROGRAM);}
try{
 child=spawn(process.env.SOLANA_TEST_VALIDATOR||'solana-test-validator',['--reset','--quiet','--ledger',join(dir,'ledger'),'--rpc-port','18899','--faucet-port','18901','--gossip-port','18902','--dynamic-port-range','18910-18940','--bind-address','127.0.0.1',
 '--bpf-program',KYDOS_PROGRAM.toBase58(),resolve('../target/deploy/kydos_launchpad.so'),'--bpf-program',DBC_PROGRAM.toBase58(),resolve('runtime/fixtures/dynamic_bonding_curve.so'),
 '--bpf-program',DAMM_PROGRAM.toBase58(),resolve('runtime/fixtures/cp_amm.so'),'--bpf-program','metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',resolve('runtime/fixtures/metaplex.so'),...genesisArgs],{stdio:['ignore',fd,fd]});
 let spawnError;child.on('error',e=>{spawnError=e;});let ready=false;
 for(let i=0;i<150;i++){if(spawnError)throw spawnError;if(child.exitCode!==null)throw new Error('validator exited');try{await c.getLatestBlockhash();ready=true;break;}catch{await delay(200);}}
 assert.ok(ready);assert.equal(await c.getBalance(payer.publicKey),2000e9);pass('built Kydos controller and pinned DBC/DAMM loaded on isolated ledger');
 const p=buildCandidateParameters();
 await send(await dbc.partner.createConfig({...p,config:config.publicKey,payer:payer.publicKey,feeClaimer:feeAuthority(),leftoverReceiver:feeAuthority(),quoteMint:NATIVE_MINT}),[payer,config],true,DBC_PROGRAM);
 const cfg=(await c.getAccountInfo(config.publicKey)).data;
 assert.equal(createHash('sha256').update(cfg.subarray(104)).digest('hex'),'fc03c742463f63e839da128dd0fb919ac3cddfb59057f8ab1faeed625e2aa46f');
 pass('actual DBC config has exact fixed-policy fingerprint and program-controlled fee rights');
 const bad=Keypair.generate();await send(await dbc.partner.createConfig({...p,config:bad.publicKey,payer:payer.publicKey,feeClaimer:trader.publicKey,leftoverReceiver:feeAuthority(),quoteMint:NATIVE_MINT}),[payer,bad],true,DBC_PROGRAM);
 const badMint=Keypair.generate(),b=feeAddresses(badMint.publicKey,bad.publicKey);
 await rejected('wrong fee authority rejects token creation and registration atomically',new Transaction().add(await launchDbcInstruction({program,payer:payer.publicKey,creator:creator.publicKey,mint:badMint.publicKey,config:bad.publicKey,metadata:{name:'Invalid',symbol:'BAD',uri:'https://example.invalid'}})),[payer,creator,badMint],[b.launch,b.mint,b.dbcPool,b.baseVault,b.quoteVault]);
 const launchIx=await launchDbcInstruction({program,payer:payer.publicKey,creator:creator.publicKey,mint:mint.publicKey,config:config.publicKey,metadata:{name:'Kydos fee controller test',symbol:'KFEE',uri:'https://example.invalid/kydos.json'}});
 const launchKeys=[a.launch,mint.publicKey,a.dbcPool,a.baseVault,a.quoteVault];
 const failingLaunch=new Transaction().add(launchIx,SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:trader.publicKey,lamports:9999e9}));
 await rejected('later transaction failure rolls back DBC mint and creator record',failingLaunch,[payer,creator,mint],launchKeys);
 await send(new Transaction().add(launchIx),[payer,creator,mint],true,KYDOS_PROGRAM);
 let record=await program.account.dbcLaunch.fetch(a.launch);assert.equal(record.creator.toBase58(),creator.publicKey.toBase58());assert.equal(record.config.toBase58(),config.publicKey.toBase58());
 assert.equal(record.dammPool.toBase58(),a.pool.toBase58());assert.equal((await getMint(c,mint.publicKey)).supply,1000000000000000n);pass('Kydos CPI creates DBC mint and immutable original-creator registry together');
 await rejected('duplicate launch cannot replace creator or mint',new Transaction().add(launchIx),[payer,creator,mint],launchKeys);
 await dbcSwap(false,1000000000n);pass('registered launch trades on DBC');
 let state=(await dbc.state.getPool(a.dbcPool)).poolState;const expectedPartner=int(state.partnerQuoteFee),reserveBefore=state.quoteReserve.toString();
 const claim=withRecipientAccounts(await claimDbcInstruction(claimArgs()),sponsor.publicKey,creator.publicKey);
 const bondingResult=await send(claim,[sponsor],true,KYDOS_PROGRAM);
 let e=event(bondingResult);assert.ok(e,'settlement event missing');assert.equal(int(e.kydosQuote),expectedPartner);assert.equal(int(e.creatorQuote),0n);assert.equal(e.source,0);
 assert.equal((await getAccount(c,treasuryAta)).amount,expectedPartner);assert.equal((await getAccount(c,creatorAta)).amount,0n);
 assert.equal((await dbc.state.getPool(a.dbcPool)).poolState.quoteReserve.toString(),reserveBefore);pass('bonding partner fees pay only Kydos without touching quote reserves');
 await send(claim,[sponsor],true,KYDOS_PROGRAM);assert.equal((await getAccount(c,treasuryAta)).amount,expectedPartner);pass('repeat empty bonding claim cannot pay twice');
 const prematureNft=Keypair.generate().publicKey;
 await rejected('AMM settlement before graduation rejects without touching custody',await settleTx({positionNftMint:prematureNft}),[sponsor],[a.launch,mint.publicKey,a.dbcPool,a.baseFees,a.quoteFees,creatorAta,treasuryAta]);
 // Unrelated tokens and WSOL are deliberately deposited in the claim vaults.
 await send(new Transaction().add(createTransferCheckedInstruction(baseTrader,mint.publicKey,a.baseFees,trader.publicKey,123456789n,6),
 createAssociatedTokenAccountIdempotentInstruction(trader.publicKey,wsolTrader,trader.publicKey,NATIVE_MINT),
 SystemProgram.transfer({fromPubkey:trader.publicKey,toPubkey:wsolTrader,lamports:17}),createSyncNativeInstruction(wsolTrader),
 createTransferCheckedInstruction(wsolTrader,NATIVE_MINT,a.quoteFees,trader.publicKey,17n,9),createCloseAccountInstruction(wsolTrader,trader.publicKey,trader.publicKey)),[trader]);
 pass('independent base and quote donations deposited for settlement-isolation test');
 await dbcSwap(false,100000000000n,sdk.SwapMode.PartialFill);
 const mig=await dbc.migration.migrateToDammV2({pool:a.dbcPool,dammConfig:migrationConfig,payer:payer.publicKey});positionMint=mig.firstPositionNftKeypair.publicKey;
 await send(mig.transaction,[payer,mig.firstPositionNftKeypair,mig.secondPositionNftKeypair],true,DBC_PROGRAM);
 const pos=sdk.derivePositionAddress(positionMint),nft=sdk.derivePositionNftAccount(positionMint);
 assert.equal((await getAccount(c,nft,'confirmed',TOKEN_2022_PROGRAM_ID)).owner.toBase58(),feeAuthority().toBase58());
 assert.equal(int((await amm.account.position.fetch(pos)).unlockedLiquidity),0n);pass('DBC graduation delivers permanently locked position directly into Kydos PDA custody');
 await send(await dbc.creator.program.methods.transferPoolCreator().accountsStrict({virtualPool:a.dbcPool,config:config.publicKey,creator:creator.publicKey,newCreator:newCreator.publicKey,eventAuthority:PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],DBC_PROGRAM)[0],program:DBC_PROGRAM}).transaction(),[payer,creator],true,DBC_PROGRAM);
 assert.equal((await dbc.state.getPool(a.dbcPool)).poolState.creator.toBase58(),newCreator.publicKey.toBase58());assert.equal((await program.account.dbcLaunch.fetch(a.launch)).creator.toBase58(),creator.publicKey.toBase58());pass('DBC creator transfer does not alter original Kydos quote entitlement');
 await ammSwap(false,10000000n);await ammSwap(true,1000000000n);pass('both AMM fee assets accrue on a real program-controlled position');
 const watched=[a.launch,mint.publicKey,a.pool,pos,nft,a.baseFees,a.quoteFees,a.tokenAVault,a.tokenBVault,creatorAta,treasuryAta];
 await rejected('changed DBC creator cannot redirect quote payouts',await settleTx({creator:newCreator.publicKey}),[sponsor],watched);
 const wrongPool=await settleDammInstruction({...claimArgs(),positionNftMint:positionMint});const idx=wrongPool.keys.findIndex(k=>k.pubkey.equals(a.pool));wrongPool.keys[idx].pubkey=a.dbcPool;
 await rejected('substituted AMM pool is rejected without fee movement',new Transaction().add(wrongPool),[sponsor],watched);
 const early=await settleTx();early.add(SystemProgram.transfer({fromPubkey:sponsor.publicKey,toPubkey:trader.publicKey,lamports:9999e9}));
 const rolled=await rejected('failure after claim, burn and payout rolls back all state and balances',early,[sponsor],watched);
 assert.ok(rolled.meta.logMessages.includes(`Program ${KYDOS_PROGRAM} success`));assert.ok(rolled.meta.logMessages.some(l=>l.includes('BurnChecked')));
 const beforeSupply=(await getMint(c,mint.publicKey)).supply,beforeCreator=(await getAccount(c,creatorAta)).amount,beforeTreasury=(await getAccount(c,treasuryAta)).amount;
 const result=await send(await settleTx(),[sponsor],true,KYDOS_PROGRAM);e=event(result);assert.ok(int(e.baseBurned)>0n&&int(e.quoteReceived)>0n);
 assert.equal((await getMint(c,mint.publicKey)).supply,beforeSupply-int(e.baseBurned));assert.equal((await getAccount(c,a.baseFees)).amount,123456789n);
 assert.equal((await getAccount(c,a.quoteFees)).amount,17n+int(e.quoteDust));assert.equal((await getAccount(c,creatorAta)).amount-beforeCreator,int(e.creatorQuote));
 assert.equal((await getAccount(c,treasuryAta)).amount-beforeTreasury,int(e.kydosQuote));assert.equal(int(e.creatorQuote),int(e.kydosQuote));
 record=await program.account.dbcLaunch.fetch(a.launch);assert.equal(int(record.baseBurned),int(e.baseBurned));pass('actual base supply reduction and equal quote payouts preserve donations and dust');
 const afterSnapshot=await snapshot(watched);await send(await settleTx(),[sponsor],true,KYDOS_PROGRAM);assert.deepEqual(await snapshot(watched),afterSnapshot);pass('repeat empty settlement moves no funds or counters');
 const bypass=await amm.methods.claimPositionFee().accountsStrict({poolAuthority:sdk.deriveDammV2PoolAuthority(),pool:a.pool,position:pos,tokenAAccount:baseTrader,tokenBAccount:a.quoteFees,tokenAVault:a.tokenAVault,tokenBVault:a.tokenBVault,tokenAMint:mint.publicKey,tokenBMint:NATIVE_MINT,positionNftAccount:nft,signer:trader.publicKey,tokenAProgram:TOKEN_PROGRAM_ID,tokenBProgram:TOKEN_PROGRAM_ID,eventAuthority:PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],DAMM_PROGRAM)[0],program:DAMM_PROGRAM}).transaction();
 const beforeBypass=await snapshot(watched);await send(bypass,[trader],false,DAMM_PROGRAM);assert.deepEqual(await snapshot(watched),beforeBypass);pass('wallet cannot bypass controller by claiming the PDA-owned position directly');
 for(let i=0;i<3;i++){await ammSwap(false,1000000n+BigInt(i));await ammSwap(true,1000000n+BigInt(i));const old=await program.account.dbcLaunch.fetch(a.launch);const r=await send(await settleTx(),[sponsor],true,KYDOS_PROGRAM);const x=event(r);assert.equal(int(x.quoteReceived)+int(old.quoteDust),2n*int(x.creatorQuote)+int(x.quoteDust));assert.equal(int(x.creatorQuote),int(x.kydosQuote));}
 pass('fragmented real fee claims conserve entitlement and carry one-unit rounding dust');
 // Bonding fees earned before graduation retain their original revenue policy.
 const oldDust=(await program.account.dbcLaunch.fetch(a.launch)).quoteDust.toString();await send(claim,[sponsor],true,KYDOS_PROGRAM);
 assert.equal((await program.account.dbcLaunch.fetch(a.launch)).quoteDust.toString(),oldDust);assert.equal((await getAccount(c,a.quoteFees)).amount,17n+BigInt(oldDust));pass('remaining bonding fees can be claimed after graduation without spending settlement dust');
 assert.equal(int((await amm.account.position.fetch(pos)).unlockedLiquidity),0n);pass('fee claims leave the liquidity permanently locked');
 assert.equal(passes.length,23,'Every fee-controller runtime assertion group must execute');
}catch(e){error=e;process.exitCode=1;console.error(e.stack||e);}finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await delay(800);if(child.exitCode===null)child.kill('SIGKILL');}
 closeSync(fd);writeFileSync(join(out,'validator.log'),readFileSync(join(dir,'validator.log')));
 writeFileSync(join(out,'fee-report.json'),JSON.stringify({succeeded:!error,passedCases:passes.length,cases:passes,measurements,error:error?.message,
 limitations:['Local pinned programs, not deployed-binary verification','Synthetic protocol config and ephemeral signing wallets','No public-network transaction or program upgrade','Rewards and migration leftovers/surplus are not claimed by this controller']},null,2)+'\n');rmSync(dir,{recursive:true,force:true});
}
if(!error)console.log(`Completed ${passes.length} fee-controller runtime checks.`);
