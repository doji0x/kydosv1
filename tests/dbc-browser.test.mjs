import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'buffer';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { MintLayout, AccountLayout, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import * as dbc from '../src/lib/solana/dbcBrowser.js';
import { prepareDbcReview, submitDbcReview, discardDbcReview } from '../src/lib/solana/dbcReview.js';
import { createActivityStore } from '../src/lib/solana/lifecycle.js';
import { encodeSignature } from '../src/lib/solana/transactions.js';
import { buildSolanaRpcPayload } from '../base44/shared/solanaRpc.js';
import idl from '../src/lib/solana/idl/kydos_launchpad.json' with { type: 'json' };

const fixture = readFileSync(new URL('../solana/dbc/fixtures/controller-config.bin', import.meta.url));
const key = n => Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => (n + i) % 256));
const payer = key(1), mint = key(55).publicKey, config = key(70).publicKey, nft = key(90).publicKey;
const info = (owner, data, executable = false) => ({ owner, data, executable, lamports: 10000000, rentEpoch: 0 });
const discriminator = async name => Buffer.from((await dbc.sha256(Buffer.from(`account:${name}`))).slice(0, 16), 'hex');
const coder = new BorshAccountsCoder(idl);
const a = dbc.dbcAddresses(mint, config);

async function harness() {
  const accounts = new Map(), programDataHashes = {};
  for (const program of [dbc.KYDOS, dbc.DBC, dbc.DAMM, dbc.METADATA]) {
    const pda = PublicKey.findProgramAddressSync([program.toBuffer()], dbc.UPGRADEABLE_LOADER)[0];
    const programBytes = Buffer.alloc(36); programBytes.writeUInt32LE(2); pda.toBuffer().copy(programBytes, 4);
    const deployed = Buffer.alloc(64); deployed.writeUInt32LE(3); deployed.writeBigUInt64LE(1n, 4); deployed[45] = 127;
    accounts.set(program.toBase58(), info(dbc.UPGRADEABLE_LOADER, programBytes, true));
    accounts.set(pda.toBase58(), info(dbc.UPGRADEABLE_LOADER, deployed));
    programDataHashes[program.toBase58()] = await dbc.sha256(deployed);
  }
  accounts.set(config.toBase58(), info(dbc.DBC, Buffer.from(fixture)));
  const registry = { version: 1, bump: a.bump, mint, config, creator: payer.publicKey, dbcPool: a.dbcPool, dammPool: a.pool,
    quoteDust: new BN(0), baseBurned: new BN(0), creatorQuotePaid: new BN(0), kydosQuotePaid: new BN(0), bondingQuotePaid: new BN(0) };
  accounts.set(a.launch.toBase58(), info(dbc.KYDOS, await coder.encode('dbcLaunch', registry)));
  const m = Buffer.alloc(82); MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 1000000000000000n,
    decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, m);
  accounts.set(mint.toBase58(), info(TOKEN_PROGRAM_ID, m));
  const virtual = Buffer.alloc(424); (await discriminator('VirtualPool')).copy(virtual);
  for (const [offset, value] of [[72,config],[104,key(100).publicKey],[136,mint],[168,a.baseVault],[200,a.quoteVault]]) value.toBuffer().copy(virtual,offset);
  virtual[308] = 3; accounts.set(a.dbcPool.toBase58(), info(dbc.DBC, virtual));
  const position = Buffer.alloc(408); (await discriminator('Position')).copy(position);
  a.pool.toBuffer().copy(position,8); nft.toBuffer().copy(position,40); position.writeBigUInt64LE(1000n,184);
  const token = Buffer.alloc(165); AccountLayout.encode({ mint: nft, owner: dbc.feeAuthority(), amount: 1n,
    delegateOption: 0, delegate: PublicKey.default, state: 1, isNativeOption: 0, isNative: 0n,
    delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default },token);
  accounts.set(dbc.positionNftAccount(nft).toBase58(), info(TOKEN_2022_PROGRAM_ID,token));
  const state = { chain: dbc.DEVNET, sends: 0, signs: 0, feeMultiplier: 1, failSim: false, emptyFees: false,
    failSend: false, mutateSigned: false, changeAfterSign: false, zeroBalance: false,
    positions: [{ pubkey: dbc.positionAddress(nft), account: info(dbc.DAMM,position) }] };
  const storageMap = new Map(), storage = { getItem: key => storageMap.get(key) ?? null, setItem: (key,value) => storageMap.set(key,value) };
  let count = 0;
  const activity = createActivityStore({ storage, locks: { request: async (_name,_opts,fn) => fn({}) }, id: () => String(++count) });
  const connection = {
    getGenesisHash: async () => state.chain,
    getAccountInfo: async pubkey => accounts.get(pubkey.toBase58()) ?? null,
    getProgramAccounts: async () => state.positions,
    getLatestBlockhash: async () => ({ blockhash: key(200).publicKey.toBase58(), lastValidBlockHeight: 100 }),
    getFeeForMessage: async message => ({ value: 5000 * message.header.numRequiredSignatures * state.feeMultiplier }),
    getBalance: async () => state.zeroBalance ? 0 : 1000000000,
    getMinimumBalanceForRentExemption: async size => size * 100,
    simulateTransaction: async tx => {
      if (state.failSim) return { value: { err: { InstructionError: [0, 'Custom'] } } };
      const data = Buffer.from(tx.message.compiledInstructions.at(-1).data);
      const bonding = data.subarray(0,8).equals(Buffer.from(idl.instructions.find(i=>i.name==='claimDbcFees').discriminator));
      const payload = Buffer.alloc(81); Buffer.from(idl.events.find(e=>e.name==='dbcFeesSettled').discriminator).copy(payload);
      mint.toBuffer().copy(payload,8); payload[40] = bonding ? 0 : 1;
      const amounts = state.emptyFees ? [0n,0n,0n,0n,0n] : bonding ? [0n,100n,0n,100n,0n] : [200n,100n,50n,50n,0n];
      amounts.forEach((value,index)=>payload.writeBigUInt64LE(value,41+index*8));
      return { value: { err: null, logs: [`Program ${dbc.KYDOS} invoke [1]`, `Program data: ${payload.toString('base64')}`, `Program ${dbc.KYDOS} success`] } };
    },
    sendRawTransaction: async wire => {
      state.sends++;
      assert.equal(activity.read().at(-1).state, 'submitting', 'durable marker must precede broadcast');
      if (state.failSend) throw new Error('Transport timeout');
      return encodeSignature(Transaction.from(wire).signature);
    },
    getSignatureStatuses: async () => ({ context: { slot: 20 }, value: [{ confirmationStatus: 'confirmed', err: null }] }),
  };
  const wallet = { publicKey: payer.publicKey, signTransaction: async tx => {
    state.signs++;
    if (state.mutateSigned) tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: key(3).publicKey, lamports: 1 }));
    tx.partialSign(payer); if (state.changeAfterSign) state.chain = dbc.MAINNET; return tx;
  } };
  const release = { enabled: true, genesisHash: dbc.DEVNET, config: config.toBase58(), programDataHashes };
  const prepare = (operation='create') => prepareDbcReview({ connection, wallet, release, operation,
    mint, nft, name:'Kydos test',symbol:'TEST',metadataUri:'https://example.com/token.json' });
  const send = review => submitDbcReview({ connection,wallet,release,review,activity });
  return { connection,wallet,release,accounts,state,activity,registry,prepare,send };
}

test('release gate fails closed on disabled, missing pins and mainnet', async () => {
  const h=await harness(); assert.throws(()=>dbc.validateDbcRelease(null),/disabled/);
  assert.throws(()=>dbc.validateDbcRelease({...h.release,genesisHash:dbc.MAINNET}),/devnet-only/);
  assert.throws(()=>dbc.validateDbcRelease({...h.release,programDataHashes:{}}),/hash/);
  assert.equal((await dbc.verifyDbcRelease(h.connection,h.release)).config,config.toBase58());
});
test('wrong network and modified deployed code reject before wallet',async()=>{
  const h=await harness();h.state.chain=dbc.MAINNET;await assert.rejects(h.prepare(),/network/);assert.equal(h.state.signs,0);
  h.state.chain=dbc.DEVNET;const pd=PublicKey.findProgramAddressSync([dbc.KYDOS.toBuffer()],dbc.UPGRADEABLE_LOADER)[0];
  h.accounts.get(pd.toBase58()).data[45]^=1;await assert.rejects(h.prepare(),/Deployed program/);
});
test('policy validates captured config and rejects every changed byte',async()=>{
  await dbc.verifyDbcConfig(info(dbc.DBC,fixture));
  for(let index=0;index<fixture.length;index++){const d=Buffer.from(fixture);d[index]^=1;await assert.rejects(dbc.verifyDbcConfig(info(dbc.DBC,d)),undefined,`byte ${index}`);}
});
test('registry decoder rejects unregistered, legacy, foreign and malformed accounts',async()=>{
  const h=await harness();const original=h.accounts.get(a.launch.toBase58());
  assert.throws(()=>dbc.decodeDbcLaunch(null,mint,config),/registered/);
  assert.throws(()=>dbc.decodeDbcLaunch({...original,owner:dbc.DBC},mint,config),/registered/);
  assert.throws(()=>dbc.decodeDbcLaunch(info(dbc.KYDOS,Buffer.alloc(397)),mint,config),/layout|record/);
  assert.throws(()=>dbc.decodeDbcLaunch(original,key(2).publicKey,config),/bindings/);
  const d=Buffer.from(original.data);d[0]^=1;assert.throws(()=>dbc.decodeDbcLaunch({...original,data:d},mint,config));
});
test('reading a changed DBC creator preserves original registry entitlement',async()=>{
  const h=await harness();const r=await dbc.readDbcLaunch(h.connection,mint,config);
  assert.equal(r.creator.toBase58(),payer.publicKey.toBase58());assert.equal(r.stage,'migrated');
});
test('malformed pool, restored mint authority and non-migrated status fail safely',async()=>{
  const h=await harness();h.accounts.get(a.dbcPool.toBase58()).data[308]=4;await assert.rejects(dbc.readDbcLaunch(h.connection,mint,config),/binding/);
  h.accounts.get(a.dbcPool.toBase58()).data[308]=0;
  const r=await dbc.readDbcLaunch(h.connection,mint,config);assert.equal(r.stage,'bonding');
  await assert.rejects(dbc.dbcFeeInstruction({connection:h.connection,payer:payer.publicKey,record:r,source:'damm',nft}),/migration/);
  h.accounts.get(mint.toBase58()).data.writeUInt32LE(1);await assert.rejects(dbc.readDbcLaunch(h.connection,mint,config),/mint/);
});
test('position discovery only selects exclusively held permanently locked positions',async()=>{
  const h=await harness(),r=await dbc.readDbcLaunch(h.connection,mint,config);
  assert.equal((await dbc.readDbcPositions(h.connection,r))[0].nft,nft.toBase58());
  h.state.positions[0].account.data.writeBigUInt64LE(1n,152);assert.deepEqual(await dbc.readDbcPositions(h.connection,r),[]);
  h.state.positions[0].account.data.writeBigUInt64LE(0n,152);
  h.accounts.get(dbc.positionNftAccount(nft).toBase58()).data.writeUInt32LE(1,72);assert.deepEqual(await dbc.readDbcPositions(h.connection,r),[]);
});
test('position discovery rejects substituted pool and excessive result sets',async()=>{
  const h=await harness(),r=await dbc.readDbcLaunch(h.connection,mint,config);
  h.state.positions[0].account.data[8]^=1;await assert.rejects(dbc.readDbcPositions(h.connection,r),/Substituted/);
  h.state.positions=Array(33).fill(h.state.positions[0]);await assert.rejects(dbc.readDbcPositions(h.connection,r),/Too many/);
});
test('unsigned launch has only creator/payer and mint signers and forbids hidden initial buy',async()=>{
  const h=await harness();const args={connection:h.connection,payer:payer.publicKey,mint,config,name:'A',symbol:'A',metadataUri:'https://example.com/a'};
  const ix=await dbc.dbcLaunchInstruction(args);assert(ix.programId.equals(dbc.KYDOS));
  assert.deepEqual([...new Set(ix.keys.filter(k=>k.isSigner).map(k=>k.pubkey.toBase58()))].sort(),[payer.publicKey.toBase58(),mint.toBase58()].sort());
  await assert.rejects(dbc.dbcLaunchInstruction({...args,initialBuyLamports:1n}),/Initial purchases/);
  await assert.rejects(dbc.dbcLaunchInstruction({...args,name:'\u{1f680}'.repeat(9)}),/UTF-8/);
  assert.equal(h.state.signs+h.state.sends,0);
});
test('settlement builders request only sponsor signature, fixed recipients and never raw claims or closes',async()=>{
  const h=await harness(),r=await dbc.readDbcLaunch(h.connection,mint,config);
  for(const source of ['bonding','damm']){
    const ix=await dbc.dbcFeeInstruction({connection:h.connection,payer:payer.publicKey,record:r,source,nft});
    assert.deepEqual(ix.keys.filter(k=>k.isSigner).map(k=>k.pubkey.toBase58()),[payer.publicKey.toBase58()]);
    assert(ix.keys.some(k=>k.pubkey.equals(dbc.recipientAta(r.creator))));assert(ix.keys.some(k=>k.pubkey.equals(dbc.recipientAta(dbc.TREASURY))));
    const tx=dbc.withDbcRecipients(ix,payer.publicKey,r.creator);assert.equal(tx.instructions.length,3);assert(tx.instructions.at(-1).programId.equals(dbc.KYDOS));
    assert.equal(dbc.withDbcRecipients(ix,payer.publicKey,dbc.TREASURY).instructions.length,2);
  }
});
test('review simulates but cannot sign/send and never exposes mint private material',async()=>{
  const h=await harness(),review=await h.prepare();
  assert.equal(h.state.signs+h.state.sends,0);assert(Object.isFrozen(review));
  assert(!('mintKeypair' in review));assert(!('transaction' in review));assert.equal(review.costs.networkFeeLamports,10000n);
  assert.equal(review.costs.rentLamports,(82n+242n+424n+165n+165n+679n)*100n);
});
test('settlement preview decodes controller event and bonding remains Kydos-only',async()=>{
  const h=await harness();let review=await h.prepare('settle');assert.equal(review.preview.creatorQuote,50n);assert.equal(review.preview.kydosQuote,50n);assert.equal(review.preview.baseBurned,200n);
  review=await h.prepare('bonding');assert.equal(review.preview.creatorQuote,0n);assert.equal(review.preview.kydosQuote,100n);
});
test('failed simulation and empty fees stop before wallet',async()=>{
  const h=await harness();h.state.failSim=true;await assert.rejects(h.prepare(),/simulation failed/);
  h.state.failSim=false;h.state.emptyFees=true;await assert.rejects(h.prepare('settle'),/No new/);assert.equal(h.state.signs,0);
});
test('insufficient sponsor funding never credits anticipated fee payouts',async()=>{
  const h=await harness();h.state.zeroBalance=true;await assert.rejects(h.prepare('settle'),/Insufficient SOL/);assert.equal(h.state.signs,0);
});
test('verified launch signs once and records before exactly one broadcast',async()=>{
  const h=await harness(),r=await h.prepare(),result=await h.send(r);assert.equal(h.state.signs,1);assert.equal(h.state.sends,1);
  assert.equal(result.mint,r.mint);assert.equal(h.activity.read()[0].state,'confirmed');assert.equal(h.activity.read()[0].metadata.protocol,'dbc-v1');
  await assert.rejects(h.send(r),/already used/);assert.equal(h.state.sends,1);
});
test('discarded review and wallet substitution cannot request a signature',async()=>{
  const h=await harness(),r=await h.prepare();discardDbcReview(r);await assert.rejects(h.send(r),/expired/);
  const next=await h.prepare();h.wallet.publicKey=key(5).publicKey;await assert.rejects(h.send(next),/Wallet changed/);assert.equal(h.state.signs,0);
});
test('increased execution costs and empty refreshed claims require new review',async()=>{
  const h=await harness(),r=await h.prepare();h.state.feeMultiplier=2;await assert.rejects(h.send(r),/cost increased/);assert.equal(h.state.signs,0);
  h.state.feeMultiplier=1;const fees=await h.prepare('settle');h.state.emptyFees=true;await assert.rejects(h.send(fees),/No new/);assert.equal(h.state.signs,0);
});
test('wallet message mutation and network switch during approval prevent broadcast',async()=>{
  let h=await harness(),r=await h.prepare();h.state.mutateSigned=true;await assert.rejects(h.send(r),/changed the reviewed transaction/);assert.equal(h.state.sends,0);
  h=await harness();r=await h.prepare();h.state.changeAfterSign=true;await assert.rejects(h.send(r),/network/);assert.equal(h.state.sends,0);
});
test('ambiguous submission remains journaled and blocks replacement creation',async()=>{
  const h=await harness(),r=await h.prepare();h.state.failSend=true;await assert.rejects(h.send(r),/ambiguous/);
  assert.equal(h.activity.read()[0].state,'unknown');const next=await h.prepare();await assert.rejects(h.send(next),/Unresolved/);assert.equal(h.state.sends,1);
});
test('u128 historical counters format exactly without Number precision loss',()=>{
  assert.equal(dbc.formatDbcAmount(18446744073709551616000000001n), '18446744073709551616.000000001');
  assert.equal(dbc.formatDbcAmount(1n,6),'0.000001');assert.throws(()=>dbc.formatDbcAmount(-1n));
});
test('RPC proxy permits only one explicitly scoped DAMM position query',()=>{
  const config={commitment:'confirmed',encoding:'base64',filters:[{dataSize:408},{memcmp:{offset:8,bytes:a.pool.toBase58()}}]};
  const request={id:'test',method:'getProgramAccounts',params:[dbc.DAMM.toBase58(),config]};
  assert.equal(JSON.parse(buildSolanaRpcPayload(request)).method,'getProgramAccounts');
  for(const params of [[dbc.KYDOS.toBase58(),config],[dbc.DAMM.toBase58(),{...config,filters:[]}],
    [dbc.DAMM.toBase58(),{...config,filters:[{dataSize:408},{memcmp:{offset:40,bytes:a.pool.toBase58()}}]}],
    [dbc.DAMM.toBase58(),{...config,dataSlice:{offset:0,length:0}}]])assert.throws(()=>buildSolanaRpcPayload({...request,params}),/pool-scoped/);
});
test('actual web3 request serialization is accepted by the bounded proxy',async()=>{
  const connection=new Connection('http://127.0.0.1:1',{fetch:async(_url,options)=>{
    const req=JSON.parse(options.body);buildSolanaRpcPayload(req);return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result:[]}));
  }});
  assert.deepEqual(await connection.getProgramAccounts(dbc.DAMM,{commitment:'confirmed',filters:[{dataSize:408},{memcmp:{offset:8,bytes:a.pool.toBase58()}}]}),[]);
});

test('fee reviews reserve all possible account rents and deduplicate equal recipients',async()=>{
  const h=await harness();const review=await h.prepare('settle');assert.equal(review.costs.rentLamports,4n*165n*100n);
  h.accounts.set(a.launch.toBase58(),info(dbc.KYDOS,await coder.encode('dbcLaunch',{...h.registry,creator:dbc.TREASURY})));
  const same=await h.prepare('settle');assert.equal(same.costs.rentLamports,3n*165n*100n);
});
