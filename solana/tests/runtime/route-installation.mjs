// Execute BUILT Kydos bytecode on a disposable loopback-only validator.
// Synthetic config accounts are NOT real Meteora operator provisioning.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Connection, PublicKey, Keypair, SystemProgram, ComputeBudgetProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { BorshAccountsCoder, Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import * as sdk from '@meteora-ag/cp-amm-sdk';

const KYDOS = new PublicKey('GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE');
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const DAMM = sdk.CP_AMM_PROGRAM_ID;
const authority = Keypair.generate(), outsider = Keypair.generate();
const derived = seed => PublicKey.findProgramAddressSync([Buffer.from(seed)], KYDOS)[0];
const route = derived('migration_route'), creator = derived('meteora_pool_creator');
const programData = id => PublicKey.findProgramAddressSync([id.toBuffer()], LOADER)[0];
const discriminator = createHash('sha256').update('global:install_migration_route').digest().subarray(0,8);
const sha256 = b => createHash('sha256').update(b).digest('hex');
const idl = JSON.parse(readFileSync(resolve('solana/target/idl/kydos_launchpad.json')));
assert.equal(idl.address, KYDOS.toBase58());
const dir = mkdtempSync(join(tmpdir(), 'kydos-route-'));
const logPath = join(dir, 'validator.log'), logFd = openSync(logPath, 'w');
let child, successes = 0, nonce = 0;
const connection = new Connection('http://127.0.0.1:18899', { commitment:'confirmed', confirmTransactionInitialTimeout:20000 });
assert.equal(new URL(connection.rpcEndpoint).hostname, '127.0.0.1');
const fixtureFile = (name, key, data, owner, lamports=100_000_000) => {
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify({ pubkey:key.toBase58(), account:{ lamports, data:[data.toString('base64'),'base64'], owner:owner.toBase58(), executable:false, rentEpoch:0 } }));
  return path;
};
function zero(type) {
  if (type === 'pubkey') return PublicKey.default;
  if (typeof type === 'string') return ['u64','u128'].includes(type) ? new BN(0) : 0;
  if (type.array) return Array.from({length:type.array[1]}, () => zero(type.array[0]));
  const definition = sdk.CpAmmIdl.types.find(t => t.name === type.defined.name);
  assert.ok(definition, 'IDL type missing');
  return Object.fromEntries(definition.type.fields.map(f => [f.name,zero(f.type)]));
}
const coder = new BorshAccountsCoder(sdk.CpAmmIdl);
const fixtures = [];
for (const [name,index,change] of [
  ['valid',910001,()=>{}],
  ['wrong-authority',910002,v=>{v.pool_creator_authority=outsider.publicKey;}],
  ['public',910003,v=>{v.pool_creator_authority=PublicKey.default;}],
  ['permissions',910004,v=>{v.permission=new BN(1);}],
  ['static',910005,v=>{v.config_type=0;}],
]) {
  const value = { ...zero({defined:{name:'Config'}}), pool_creator_authority:creator, config_type:1, index:new BN(index) };
  change(value);
  const data = await coder.encode('Config', value);
  assert.equal(data.length,328);
  const key = sdk.deriveConfigAddress(new BN(index));
  fixtures.push({name,key,data,path:fixtureFile(name,key,data,DAMM)});
}
const valid = fixtures[0], impostor = Keypair.generate().publicKey, wrongOwner = Keypair.generate().publicKey;
fixtures.push({name:'wrong-address',key:impostor,path:fixtureFile('wrong-address',impostor,valid.data,DAMM)});
fixtures.push({name:'wrong-owner',key:wrongOwner,path:fixtureFile('wrong-owner',wrongOwner,valid.data,KYDOS)});
const donation = 1_000_000;
const prefund = fixtureFile('prefunded-route',route,Buffer.alloc(0),SystemProgram.programId,donation);
function ix(signer, config, edits={}) {
  const keys = [
    {pubkey:signer,isSigner:true,isWritable:true},
    {pubkey:KYDOS,isSigner:false,isWritable:false},
    {pubkey:programData(KYDOS),isSigner:false,isWritable:false},
    {pubkey:DAMM,isSigner:false,isWritable:false},
    {pubkey:programData(DAMM),isSigner:false,isWritable:false},
    {pubkey:config,isSigner:false,isWritable:false},
    {pubkey:route,isSigner:false,isWritable:true},
    {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
  ];
  for (const [index,value] of Object.entries(edits)) keys[Number(index)] = {...keys[Number(index)],...value};
  return new TransactionInstruction({programId:KYDOS,keys,data:discriminator});
}
async function execute(instructions,signer) {
  const latest = await connection.getLatestBlockhash();
  // Unique message even in the same block: a repeated install cannot be mistaken
  // for a previously successful transaction with an identical signature.
  const tx = new Transaction({...latest,feePayer:signer.publicKey})
    .add(ComputeBudgetProgram.setComputeUnitLimit({units:400000+(++nonce)}),...instructions);
  tx.sign(signer);
  const signature = await connection.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:2});
  const result = await connection.confirmTransaction({...latest,signature},'confirmed');
  const recorded = await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
  assert.ok(recorded?.meta, 'Missing confirmed transaction metadata');
  assert.deepEqual(recorded.meta.err,result.value.err);
  assert.ok(recorded.meta.logMessages?.some(l=>l.includes(`Program ${KYDOS.toBase58()} invoke`)), 'Kydos did not execute');
  return recorded.meta;
}
const pass = text => {successes++; console.log(`PASS ${text}`);};
async function rejectAndPreserve(name,instruction,signer) {
  const before = await connection.getAccountInfo(route);
  const meta = await execute([instruction],signer);
  assert.ok(meta.err, `${name}: unexpectedly accepted`);
  const after = await connection.getAccountInfo(route);
  assert.equal(after.owner.toBase58(),before.owner.toBase58());
  assert.equal(after.lamports,before.lamports); assert.deepEqual(after.data,before.data);
  pass(`${name}: rejected in executed transaction, route unchanged`);
}
try {
  const fixtureBinary = resolve('solana/target/runtime-fixtures/cp_amm.so');
  const bytes = readFileSync(fixtureBinary);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), '946562cfc35b978dbaf1100363b7505b018fd6f6');
  child = spawn('solana-test-validator',[
    '--reset','--quiet','--ledger',join(dir,'ledger'),'--rpc-port','18899','--faucet-port','18901',
    '--gossip-port','18902','--dynamic-port-range','18910-18940','--bind-address','127.0.0.1',
    '--upgradeable-program',KYDOS.toBase58(),resolve('solana/target/deploy/kydos_launchpad.so'),authority.publicKey.toBase58(),
    '--upgradeable-program',DAMM.toBase58(),fixtureBinary,'none',
    '--account',route.toBase58(),prefund,
    ...fixtures.flatMap(f=>['--account',f.key.toBase58(),f.path]),
  ],{stdio:['ignore',logFd,logFd]});
  let spawnError; child.on('error',error=>{spawnError=error;});
  const deadline=Date.now()+120000;
  for (;;) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error('Validator exited before readiness');
    if (Date.now()>deadline) throw new Error('Validator startup timeout');
    try {await connection.getLatestBlockhash();break;} catch {await delay(500);}
  }
  for (const signer of [authority,outsider]) {
    const signature=await connection.requestAirdrop(signer.publicKey,2_000_000_000);
    const result=await connection.confirmTransaction({...await connection.getLatestBlockhash(),signature},'confirmed');
    assert.equal(result.value.err,null,'Local airdrop failed');
  }
  const program=new Program(idl,{connection});
  const generated=await program.methods.installMigrationRoute().accountsStrict({
    authority:authority.publicKey,kydosProgram:KYDOS,kydosProgramData:programData(KYDOS),
    dammProgram:DAMM,dammProgramData:programData(DAMM),config:valid.key,route,systemProgram:SystemProgram.programId,
  }).instruction();
  assert.deepEqual(generated.data,discriminator);
  assert.deepEqual(generated.keys,ix(authority.publicKey,valid.key).keys);
  pass('SDK/IDL instruction parity');
  await rejectAndPreserve('outsider cannot install',ix(outsider.publicKey,valid.key),outsider);
  for (const f of fixtures.slice(1)) await rejectAndPreserve(f.name,ix(authority.publicKey,f.key),authority);
  await rejectAndPreserve('substituted Kydos ProgramData',ix(authority.publicKey,valid.key,{2:{pubkey:programData(DAMM)}}),authority);
  await rejectAndPreserve('substituted DAMM ProgramData',ix(authority.publicKey,valid.key,{4:{pubkey:programData(KYDOS)}}),authority);
  const extra=ix(authority.publicKey,valid.key);
  extra.keys.push({pubkey:outsider.publicKey,isSigner:false,isWritable:false});
  await rejectAndPreserve('unexpected remaining account',extra,authority);
  const failed=await execute([ix(authority.publicKey,valid.key),SystemProgram.transfer({
    fromPubkey:authority.publicKey,toPubkey:outsider.publicKey,lamports:9_000_000_000,
  })],authority);
  assert.equal(failed.err?.InstructionError?.[0],2,'Expected second business instruction to fail');
  assert.ok(failed.logMessages.some(l=>l===`Program ${KYDOS.toBase58()} success`),'Route installation did not succeed before forced failure');
  const rolledBack=await connection.getAccountInfo(route);
  assert.equal(rolledBack.owner.toBase58(),SystemProgram.programId.toBase58());
  assert.equal(rolledBack.lamports,donation); assert.equal(rolledBack.data.length,0);
  pass('executed route creation rolls back when later instruction fails');
  const success=await execute([ix(authority.publicKey,valid.key)],authority);
  assert.equal(success.err,null,JSON.stringify(success));
  const account=await connection.getAccountInfo(route);
  assert.equal(account.owner.toBase58(),KYDOS.toBase58()); assert.equal(account.data.length,287);
  const decoded=program.coder.accounts.decode('migrationRoute',account.data);
  assert.equal(decoded.version,1); assert.equal(decoded.config.toBase58(),valid.key.toBase58());
  assert.equal(Buffer.from(decoded.configHash).toString('hex'),sha256(valid.data));
  assert.equal(decoded.creatorAuthority.toBase58(),creator.toBase58());
  assert.equal(decoded.installedBy.toBase58(),authority.publicKey.toBase58());
  assert.equal(decoded.treasury.toBase58(),'5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg');
  assert.equal(decoded.baseFeeBps,100); assert.equal(decoded.collectFeeMode,0);
  assert.equal(decoded.permanentLockPolicy,1); assert.equal(decoded.settlementPolicyVersion,1);
  assert.equal(decoded.dammProgram.toBase58(),DAMM.toBase58());
  assert.equal(decoded.dammProgramData.toBase58(),programData(DAMM).toBase58());
  const pd=await connection.getAccountInfo(programData(DAMM));
  assert.equal(decoded.dammDeploymentSlot.toString(),pd.data.readBigUInt64LE(4).toString());
  pass(`authorized install on prefunded PDA; policy matches; compute units ${success.computeUnitsConsumed}`);
  await rejectAndPreserve('route cannot be reinstalled',ix(authority.publicKey,valid.key),authority);
  console.log(`Route runtime checks passed: ${successes}. Synthetic configs; no mainnet authorization, migration or DAMM CPI tested.`);
} catch (error) {
  console.error(readFileSync(logPath,'utf8').slice(-12000));
  throw error;
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  closeSync(logFd); rmSync(dir,{recursive:true,force:true});
}
