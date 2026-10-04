// Execute built Kydos AND pinned DAMM bytecode. Synthetic source/config genesis
// fixtures are not mainnet compatibility evidence or operator provisioning.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT, MintLayout, AccountLayout,
  getAssociatedTokenAddressSync, unpackAccount } from '@solana/spl-token';
import BN from 'bn.js';
import * as sdk from '@meteora-ag/cp-amm-sdk';
import { deriveMigrationAddresses, quoteSeedLiquidity, MIN_SQRT_PRICE, MAX_SQRT_PRICE } from '../../../src/lib/solana/meteora.js';
import { confirmed } from './confirmed.mjs';

const K = new PublicKey('GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE');
const D = sdk.CP_AMM_PROGRAM_ID;
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const TREASURY = new PublicKey('5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg');
const authority = Keypair.generate(), sponsor = Keypair.generate(), stranger = Keypair.generate();
const dammAuthority = Keypair.generate().publicKey;
const connection = new Connection('http://127.0.0.1:18899', 'confirmed');
assert.equal(new URL(connection.rpcEndpoint).hostname, '127.0.0.1');
const idl = JSON.parse(readFileSync('solana/target/idl/kydos_launchpad.json'));
const program = new Program(idl, {connection});
const cp = new Program(sdk.CpAmmIdl, {connection});
const bn = n => new BN(n.toString());
const pda = (seeds, owner=K) => PublicKey.findProgramAddressSync(seeds.map(s=>typeof s==='string'?Buffer.from(s):s.toBuffer()),owner);
const pd = key => pda([key],LOADER)[0];
const route = pda(['migration_route'])[0], creator = pda(['meteora_pool_creator'])[0];
const config = sdk.deriveConfigAddress(new BN(910011));
const TOTAL = 1_000_000_000_000_000n, A = 206_900_000_000_000n, B = 85_005_359_057n;
const CURVE_SIZE = 393, RECEIPT_SIZE = 493;
const rent = size => (size + 128) * 6960; // Asserted against this validator below.
const dir = mkdtempSync(join(tmpdir(),'kydos-graduation-'));
const logPath = join(dir,'validator.log'), fd = openSync(logPath,'w');
const fixtures = [], sources = [];
let child, nonce=0, passes=0, maxPacket=0;
const pass = message => { passes++; console.log(`PASS ${message}`); };

function zero(type, schema=cp.idl) {
  if (type === 'pubkey') return PublicKey.default;
  if (type === 'bool') return false;
  if (typeof type === 'string') return ['u64','u128','i64','i128'].includes(type) ? new BN(0) : 0;
  if (type.array) return Array.from({length:type.array[1]},()=>zero(type.array[0],schema));
  const def = schema.types.find(t=>t.name===type.defined.name);
  assert.equal(def?.type.kind,'struct',`Unsupported fixture type ${JSON.stringify(type)}`);
  return Object.fromEntries(def.type.fields.map(f=>[f.name,zero(f.type,schema)]));
}
function layout(name, prefix='', start=8, out={}) {
  const type = cp.idl.types.find(t=>t.name===name).type;
  let offset=start;
  function size(t) {
    if (typeof t==='string') return ({u8:1,i8:1,bool:1,u16:2,i16:2,u32:4,i32:4,u64:8,i64:8,u128:16,i128:16,pubkey:32})[t] ?? assert.fail(`Unknown type ${t}`);
    if(t.array) return size(t.array[0])*t.array[1];
    return cp.idl.types.find(d=>d.name===t.defined.name).type.fields.reduce((n,f)=>n+size(f.type),0);
  }
  for(const f of type.fields) {
    const path=prefix+f.name;out[path]=offset;
    if(f.type.defined) layout(f.type.defined.name,path+'.',offset,out);
    offset+=size(f.type);
  }
  return {out,end:offset};
}
function verifyLayouts() {
  const pool=layout('pool'), position=layout('position');
  assert.equal(pool.end,1112);assert.equal(position.end,408);
  for(const [name,offset] of Object.entries({
    'poolFees.baseFee':8,'poolFees.protocolFeePercent':48,'poolFees.referralFeePercent':50,
    'poolFees.compoundingFeeBps':54,'poolFees.dynamicFee':56,'poolFees.initSqrtPrice':152,
    tokenAMint:168,tokenBMint:200,tokenAVault:232,tokenBVault:264,whitelistedVault:296,
    liquidity:360,protocolAFee:392,protocolBFee:400,sqrtMinPrice:424,sqrtMaxPrice:440,
    sqrtPrice:456,activationPoint:472,activationType:480,poolStatus:481,tokenAFlag:482,
    tokenBFlag:483,collectFeeMode:484,poolType:485,feeAPerLiquidity:488,feeBPerLiquidity:520,
    permanentLockLiquidity:552,'metrics.totalPosition':632,creator:648,
  })) assert.equal(pool.out[name],offset,`Pinned Pool.${name} offset`);
  for(const [name,offset] of Object.entries({pool:8,nftMint:40,feeAPerTokenCheckpoint:72,
    feeBPerTokenCheckpoint:104,feeAPending:136,feeBPending:144,unlockedLiquidity:152,
    vestedLiquidity:168,permanentLockedLiquidity:184,metrics:200})) {
    assert.equal(position.out[name],offset,`Pinned Position.${name} offset`);
  }
  pass('pinned SDK Pool/Position field offsets and account sizes match the on-chain verifier');
}
function fixture(key,data,owner,lamports=rent(data.length)) {
  assert.ok(Number.isSafeInteger(lamports));
  const path=join(dir,`${fixtures.length}.json`);
  writeFileSync(path,JSON.stringify({pubkey:key.toBase58(),account:{lamports,
    data:[data.toString('base64'),'base64'],owner:owner.toBase58(),executable:false,rentEpoch:0}}));
  fixtures.push({key,path});
}
function mintBytes(supply=TOTAL,authority=PublicKey.default,decimals=6) {
  const bytes=Buffer.alloc(MintLayout.span);
  MintLayout.encode({mintAuthorityOption:authority.equals(PublicKey.default)?0:1,mintAuthority:authority,
    supply,decimals,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},bytes);
  return bytes;
}
function tokenBytes(mint,owner,amount,native=false) {
  const bytes=Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({mint,owner,amount,delegateOption:0,delegate:PublicKey.default,state:1,
    isNativeOption:native?1:0,isNative:native?BigInt(rent(AccountLayout.span)):0n,
    delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},bytes);
  return bytes;
}
async function source(label,byte,options={}) {
  const mint=new PublicKey(Buffer.alloc(32,byte));
  const a=deriveMigrationAddresses(K,mint,config);
  const [curve,curveBump]=pda(['curve',mint]);
  const [feePolicy,feeBump]=pda(['fee_policy',curve]);
  const vault=pda(['vault',mint])[0];
  const solDonation=options.donations?7_000_000:0;
  const tokenDonation=options.donations?111_111n:0n;
  const recordedCreator=options.thirdParty?stranger.publicKey:sponsor.publicKey;
  const value={creator:recordedCreator,mint,bump:curveBump,decimals:6,name:'Runtime',symbol:'TEST',metadataUri:'',
    totalSupply:bn(TOTAL),curveTokenAllocation:bn(793_100_000_000_000n),liquidityTokenAllocation:bn(A),
    virtualTokenReserves:bn(1_073_000_000_000_000n),virtualSolReserves:bn(30_000_000_000n),
    realTokenReserves:bn(options.incomplete?1n:0n),realSolReserves:bn(B),graduationTarget:bn(B),graduated:!options.incomplete};
  const encoded=await program.coder.accounts.encode('curve',value);
  const padded=Buffer.alloc(CURVE_SIZE);encoded.copy(padded);
  const sourceSol=rent(CURVE_SIZE)+Number(B)+solDonation-(options.underfunded?1:0);
  fixture(curve,padded,K,sourceSol);
  fixture(feePolicy,await program.coder.accounts.encode('feePolicy',{
    version:options.badPolicy?2:1,bump:feeBump,curve,treasury:TREASURY,tradingFeeBps:100,
  }),K);
  fixture(mint,mintBytes(TOTAL-100n,options.authority?stranger.publicKey:PublicKey.default),TOKEN_PROGRAM_ID);
  const sourceTokens=A+tokenDonation-(options.shortTokens?1n:0n)+(options.incomplete?1n:0n);
  fixture(vault,tokenBytes(mint,curve,sourceTokens),TOKEN_PROGRAM_ID);
  const prefunds={};
  if(options.donations) for(const [field,lamports] of Object.entries({payer:1_000_000,
    tokenAStaging:3_000_000,tokenBStaging:4_000_000,tokenAVault:1_000_000,tokenBVault:5_000_000,
    pool:1_000_000,position:1_000_000,positionNftMint:1_000_000,positionNftAccount:1_000_000,receipt:1_000_000})) {
    fixture(a[field],Buffer.alloc(0),SystemProgram.programId,lamports);prefunds[field]=lamports;
  }
  if(options.occupied) fixture(a.pool,Buffer.from([1]),SystemProgram.programId,1_000_000);
  const userToken=getAssociatedTokenAddressSync(mint,sponsor.publicKey);
  fixture(userToken,tokenBytes(mint,sponsor.publicKey,1_000_000_000_000n),TOKEN_PROGRAM_ID);
  const s={label,a,mint,curve,vault,feePolicy,recordedCreator,userToken,sourceSol,sourceTokens,prefunds,quote:quoteSeedLiquidity(A,B)};
  sources.push(s);return s;
}
function accounts(s,edits={}) {
  const a=s.a;
  return {sponsor:sponsor.publicKey,curve:s.curve,feePolicy:s.feePolicy,mint:s.mint,vault:s.vault,
    route,receipt:a.receipt,config,dammProgram:D,dammProgramData:pd(D),payer:a.payer,
    poolCreatorAuthority:a.poolCreatorAuthority,positionOwner:a.positionOwner,poolAuthority:a.poolAuthority,
    pool:a.pool,position:a.position,positionNftMint:a.positionNftMint,positionNftAccount:a.positionNftAccount,
    quoteMint:NATIVE_MINT,tokenAVault:a.tokenAVault,tokenBVault:a.tokenBVault,
    tokenAStaging:a.tokenAStaging,tokenBStaging:a.tokenBStaging,eventAuthority:a.eventAuthority,
    tokenProgram:TOKEN_PROGRAM_ID,token2022Program:TOKEN_2022_PROGRAM_ID,systemProgram:SystemProgram.programId,...edits};
}
const migrate=(s,budget=100_000_000,edits={})=>program.methods.migrate(new BN(budget)).accountsStrict(accounts(s,edits)).instruction();
async function execute(instructions,{requiredProgram=K.toBase58(),signers=[sponsor],units}={}) {
  const latest=await connection.getLatestBlockhash();
  const tx=new Transaction({...latest,feePayer:sponsor.publicKey}).add(
    ComputeBudgetProgram.requestHeapFrame({bytes:262144}),
    ComputeBudgetProgram.setComputeUnitLimit({units:units??1_300_000+(++nonce)}),...instructions);
  tx.sign(...signers);
  const bytes=tx.serialize();maxPacket=Math.max(maxPacket,bytes.length);
  assert.ok(bytes.length<=1232,`Oversize transaction ${bytes.length}`);
  const signature=await connection.sendRawTransaction(bytes,{skipPreflight:true,maxRetries:2});
  return confirmed(connection,signature,{requiredProgram,lastValidBlockHeight:latest.lastValidBlockHeight});
}
async function snapshot(s) {
  const keys=[s.curve,s.vault,s.mint,s.feePolicy,route,config,s.a.receipt,s.a.payer,s.a.pool,s.a.position,
    s.a.positionNftMint,s.a.positionNftAccount,s.a.tokenAVault,s.a.tokenBVault,s.a.tokenAStaging,s.a.tokenBStaging];
  return (await connection.getMultipleAccountsInfo(keys)).map(x=>x?{
    owner:x.owner.toBase58(),lamports:x.lamports,data:x.data.toString('hex'),executable:x.executable}:null);
}
async function rejected(label,s,instruction,options) {
  const before=await snapshot(s);
  const result=await execute([instruction],options);
  assert.ok(result.meta.err,`${label}: unexpectedly succeeded`);
  assert.deepEqual(await snapshot(s),before,`${label}: state changed on rejection`);
  pass(`${label}: executed rejection, all source/destination accounts unchanged`);
  return result;
}
function assertSuccess(result,label) {
  assert.equal(result.meta.err,null,`${label}: ${JSON.stringify(result.meta.err)}\n${result.meta.logMessages?.join('\n')}`);
}
async function validateSuccess(s) {
  const data=await connection.getAccountInfo(s.a.receipt);
  assert.equal(data.data.length,RECEIPT_SIZE);assert.ok(data.owner.equals(K));
  const r=program.coder.accounts.decode('migrationReceipt',data.data);
  for(const [field,value] of Object.entries({version:1,routeVersion:1,lockPolicy:1,settlementPolicyVersion:1})) assert.equal(r[field],value);
  for(const [field,value] of Object.entries({curve:s.curve,mint:s.mint,creator:s.recordedCreator,route,config,
    pool:s.a.pool,position:s.a.position,positionNftMint:s.a.positionNftMint,positionOwner:s.a.positionOwner,
    treasury:TREASURY,quoteMint:NATIVE_MINT})) assert.ok(r[field].equals(value),field);
  for(const [field,value] of Object.entries({tokenABudget:A,tokenBBudget:B,
    tokenADeposited:s.quote.tokenAAmount,tokenBDeposited:s.quote.tokenBAmount,
    tokenADust:s.quote.tokenADust,tokenBDust:s.quote.tokenBDust,sqrtPrice:s.quote.sqrtPrice,liquidity:s.quote.liquidity})) {
    assert.equal(r[field].toString(),value.toString(),field);
  }
  const position=await cp.account.position.fetch(s.a.position),pool=await cp.account.pool.fetch(s.a.pool);
  assert.equal(position.unlockedLiquidity.toString(),'0');assert.equal(position.vestedLiquidity.toString(),'0');
  assert.equal(position.permanentLockedLiquidity.toString(),r.liquidity.toString());
  assert.equal(pool.permanentLockLiquidity.toString(),r.liquidity.toString());
  assert.equal(pool.collectFeeMode,0);assert.equal(pool.poolFees.compoundingFeeBps,0);
  const holding=unpackAccount(s.a.positionNftAccount,await connection.getAccountInfo(s.a.positionNftAccount),TOKEN_2022_PROGRAM_ID);
  assert.ok(holding.owner.equals(s.a.positionOwner));assert.equal(holding.amount,1n);assert.equal(holding.delegate,null);
  const remaining=await program.account.curve.fetch(s.curve);
  assert.equal(remaining.realSolReserves.toString(),r.tokenBDust.toString());
  assert.equal((await connection.getAccountInfo(s.curve)).lamports,
    s.sourceSol-Number(s.quote.tokenBAmount)+(s.prefunds.tokenAStaging??0)+(s.prefunds.tokenBStaging??0));
  assert.equal(unpackAccount(s.vault,await connection.getAccountInfo(s.vault)).amount,s.sourceTokens-s.quote.tokenAAmount);
  assert.equal((await connection.getAccountInfo(s.a.payer))?.lamports??0,s.prefunds.payer??0);
  assert.equal(await connection.getAccountInfo(s.a.tokenAStaging),null);
  assert.equal(await connection.getAccountInfo(s.a.tokenBStaging),null);
  return r;
}
try {
  verifyLayouts();
  fixture(authority.publicKey,Buffer.alloc(0),SystemProgram.programId,2_000_000_000);
  fixture(sponsor.publicKey,Buffer.alloc(0),SystemProgram.programId,10_000_000_000);
  fixture(stranger.publicKey,Buffer.alloc(0),SystemProgram.programId,1_000_000_000);
  fixture(NATIVE_MINT,mintBytes(0n,PublicKey.default,9),TOKEN_PROGRAM_ID);
  const userQuote=getAssociatedTokenAddressSync(NATIVE_MINT,sponsor.publicKey);
  fixture(userQuote,tokenBytes(NATIVE_MINT,sponsor.publicKey,1_000_000_000n,true),TOKEN_PROGRAM_ID,rent(165)+1_000_000_000);
  const configValue={...zero({defined:{name:'config'}}),poolCreatorAuthority:creator,configType:1,index:new BN(910011)};
  const configBytes=await cp.coder.accounts.encode('config',configValue);
  assert.equal(configBytes.length,328);assert.equal(configBytes[202],1);assert.ok(configBytes.subarray(40,72).equals(creator.toBuffer()));
  fixture(config,configBytes,D);
  const clean=await source('clean lower mint',1);
  const donated=await source('prefunded higher mint',254,{donations:true,thirdParty:true});
  const bad=[await source('incomplete curve',2,{incomplete:true}),
    await source('missing tracked SOL',3,{underfunded:true}),await source('restored mint authority',4,{authority:true}),
    await source('missing migration tokens',5,{shortTokens:true}),await source('unreceipted occupied pool',6,{occupied:true}),
    await source('unsupported fee policy',7,{badPolicy:true})];
  const binary=resolve('solana/target/runtime-fixtures/cp_amm.so'),bytes=readFileSync(binary);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),'946562cfc35b978dbaf1100363b7505b018fd6f6');
  child=spawn('solana-test-validator',['--reset','--quiet','--ledger',join(dir,'ledger'),
    '--rpc-port','18899','--faucet-port','18901','--gossip-port','18902','--dynamic-port-range','18910-18940','--bind-address','127.0.0.1',
    '--upgradeable-program',K.toBase58(),resolve('solana/target/deploy/kydos_launchpad.so'),authority.publicKey.toBase58(),
    '--upgradeable-program',D.toBase58(),binary,dammAuthority.toBase58(),...fixtures.flatMap(f=>['--account',f.key.toBase58(),f.path])],{stdio:['ignore',fd,fd]});
  let spawnError;child.on('error',e=>{spawnError=e;});const deadline=Date.now()+120000;
  for(;;) {
    if(spawnError) throw spawnError;if(child.exitCode!==null) throw new Error('Validator exited');
    if(Date.now()>deadline) throw new Error('Validator startup timeout');
    try {await connection.getLatestBlockhash();break;}catch {await delay(500);}
  }
  assert.ok((await connection.getAccountInfo(pd(K))).data.subarray(13,45).equals(authority.publicKey.toBuffer()),'Wrong local validator');
  const dammLoader=await connection.getAccountInfo(pd(D));
  assert.equal(dammLoader.data[12],1);
  assert.ok(dammLoader.data.subarray(13,45).equals(dammAuthority.toBuffer()),'Invalid DAMM loader fixture');
  for(const size of [82,165,CURVE_SIZE,RECEIPT_SIZE]) assert.equal(await connection.getMinimumBalanceForRentExemption(size),rent(size));
  const install=await program.methods.installMigrationRoute().accountsStrict({authority:authority.publicKey,kydosProgram:K,
    kydosProgramData:pd(K),dammProgram:D,dammProgramData:pd(D),config,route,systemProgram:SystemProgram.programId}).instruction();
  assertSuccess(await execute([install],{signers:[sponsor,authority]}),'route installation');
  pass('installed synthetic protected route through real Kydos instruction');
  for(const s of bad) await rejected(s.label,s,await migrate(s));
  for(const field of ['pool','position','positionOwner','poolCreatorAuthority','tokenAVault','tokenBVault','tokenAStaging','tokenBStaging','config','dammProgramData']) {
    await rejected(`substituted ${field}`,clean,await migrate(clean,100_000_000,{[field]:stranger.publicKey}));
  }
  await rejected('insufficient authorized setup budget',clean,await migrate(clean,1));
  const extra=await migrate(clean);extra.keys.push({pubkey:stranger.publicKey,isSigner:false,isWritable:false});
  await rejected('extra unapproved account',clean,extra);
  for(const units of [30_000,60_000]) await rejected(`compute exhaustion at ${units}`,clean,await migrate(clean),{units});
  const fundingFailure=await rejected('setup budget exhausted after sponsor transfer',clean,await migrate(clean,5_000_000));
  assert.ok(fundingFailure.meta.logMessages.filter(l=>l==='Program 11111111111111111111111111111111 success').length>=2);
  const late=await rejected('compute exhaustion after DAMM pool creation',clean,await migrate(clean),{units:350_000});
  assert.ok(late.meta.logMessages.includes(`Program ${D.toBase58()} success`),'DAMM creation must complete before this forced failure');
  const before=await snapshot(clean);
  const rollback=await execute([await migrate(clean),SystemProgram.transfer({fromPubkey:sponsor.publicKey,toPubkey:stranger.publicKey,lamports:50_000_000_000})]);
  assert.ok(rollback.meta.logMessages.includes(`Program ${K.toBase58()} success`),`migration must succeed before injected transaction failure: ${JSON.stringify(rollback.meta.err)}\n${rollback.meta.logMessages?.join('\n')}`);
  assert.equal(rollback.meta.err?.InstructionError?.[0],3);
  assert.deepEqual(await snapshot(clean),before);
  pass('complete pool creation and permanent lock roll back with a later transaction failure');
  const startBalance=await connection.getBalance(sponsor.publicKey);
  const first=await execute([await migrate(clean)]);assertSuccess(first,'clean graduation');
  const receipt=await validateSuccess(clean);
  const setupSpent=startBalance-(await connection.getBalance(sponsor.publicKey))-first.meta.fee;
  assert.ok(setupSpent>0&&setupSpent<=100_000_000);
  assert.ok(first.meta.logMessages.some(l=>l===`Program ${D.toBase58()} invoke [2]`));
  console.log(`GRADUATION_METRICS ${JSON.stringify({computeUnits:first.meta.computeUnitsConsumed,setupLamports:setupSpent,heapRequested:262144})}`);
  pass('real DAMM creation, exact deposits, complete permanent lock, cleanup, receipt and bounded sponsor costs');
  const replayBefore=await snapshot(clean);
  const replay=await execute([await migrate(clean,0)]);assertSuccess(replay,'idempotent replay');
  assert.deepEqual(await snapshot(clean),replayBefore);
  assert.ok(!replay.meta.logMessages.some(l=>l.includes(`Program ${D.toBase58()} invoke`)));
  pass('zero-budget replay after temporary-account cleanup has no DAMM CPI and no state change');
  const concurrent=await Promise.all([execute([await migrate(donated)]),execute([await migrate(donated)])]);
  for(const r of concurrent) assertSuccess(r,'concurrent graduation');
  assert.equal(concurrent.filter(r=>r.meta.logMessages.some(l=>l===`Program ${D.toBase58()} invoke [2]`)).length,1);
  await validateSuccess(donated);
  pass('third-party concurrent attempts seed only once; prefunding and donations stay outside principal/refunds');
  const swap=await cp.methods.swap({amountIn:new BN(10_000_000),minimumAmountOut:new BN(1)}).accountsPartial({
    poolAuthority:clean.a.poolAuthority,pool:clean.a.pool,payer:sponsor.publicKey,inputTokenAccount:userQuote,
    outputTokenAccount:clean.userToken,tokenAVault:clean.a.tokenAVault,tokenBVault:clean.a.tokenBVault,
    tokenAMint:clean.mint,tokenBMint:NATIVE_MINT,tokenAProgram:TOKEN_PROGRAM_ID,tokenBProgram:TOKEN_PROGRAM_ID,referralTokenAccount:null,
  }).instruction();
  assertSuccess(await execute([swap],{requiredProgram:D.toBase58()}),'post-graduation swap');
  assert.notEqual((await cp.account.pool.fetch(clean.a.pool)).sqrtPrice.toString(),receipt.sqrtPrice.toString());
  const traded=await snapshot(clean);
  assertSuccess(await execute([await migrate(clean,0)]),'post-trade replay');
  assert.deepEqual(await snapshot(clean),traded);
  pass('replay succeeds after a real swap changes price and fee growth');
  assert.equal(passes,29,'Every planned runtime case must execute');
  console.log(`Graduation runtime checks passed: ${passes}; maximum signed packet ${maxPacket}/1232 bytes. Synthetic genesis, pinned executable only; no live provisioning or mainnet release approval.`);
} catch(error) {
  console.error(readFileSync(logPath,'utf8').slice(-16000));throw error;
} finally {
  if(child&&child.exitCode===null) {child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(5000)]);if(child.exitCode===null)child.kill('SIGKILL');}
  closeSync(fd);rmSync(dir,{recursive:true,force:true});
}
