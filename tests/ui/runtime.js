// Test-only wallet and RPC. No public endpoint or real key is used by this harness.
import { Buffer } from 'buffer';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import { MintLayout, AccountLayout, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import * as dbc from '../../src/lib/solana/dbcBrowser.js';
import { encodeSignature } from '../../src/lib/solana/transactions.js';
import idl from '../../src/lib/solana/idl/kydos_launchpad.json';
import configBytes from 'virtual:dbc-fixture';

const key = n => Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => (n + i) % 256));
const payer = key(1), config = key(70).publicKey, fixtureMint = key(55).publicKey, nft = key(90).publicKey;
const coder = new BorshAccountsCoder(idl), accounts = new Map();
const info = (owner, data, executable = false) => ({ owner, data, executable, lamports: 10000000, rentEpoch: 0 });
const disc = async name => Buffer.from((await dbc.sha256(Buffer.from(`account:${name}`))).slice(0,16), 'hex');
const mode = new URLSearchParams(location.search).get('case');
export const state = { signs: 0, sends: 0, images: 0, metadata: 0, failMetadata: false, failSend: false,
  reject: false, lowBalance: false, height: 50, chain: mode === 'devnet' ? dbc.DEVNET : dbc.MAINNET,
  fixtureMint: fixtureMint.toBase58(), positions: [], lastWire: null, authenticated: mode !== 'signed-out' };
window.__DBC_TEST__ = state;
async function registerMint(mint, migrated = false) {
  const a = dbc.dbcAddresses(mint, config);
  accounts.set(a.launch.toBase58(), info(dbc.KYDOS, await coder.encode('dbcLaunch', {
    version: 1, bump: a.bump, mint, config, creator: payer.publicKey, dbcPool: a.dbcPool, dammPool: a.pool,
    quoteDust: new BN(0), baseBurned: new BN(0), creatorQuotePaid: new BN(0), kydosQuotePaid: new BN(0), bondingQuotePaid: new BN(0),
  })));
  const bytes = Buffer.alloc(82); MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default,
    supply: 1000000000000000n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, bytes);
  accounts.set(mint.toBase58(), info(TOKEN_PROGRAM_ID, bytes));
  const pool = Buffer.alloc(424); (await disc('VirtualPool')).copy(pool);
  for (const [offset,k] of [[72,config],[104,payer.publicKey],[136,mint],[168,a.baseVault],[200,a.quoteVault]]) k.toBuffer().copy(pool, offset);
  pool[308] = migrated ? 3 : 0; accounts.set(a.dbcPool.toBase58(), info(dbc.DBC,pool));
  return a;
}
export async function setup() {
  globalThis.Buffer = Buffer;
  const hashes = {};
  for (const program of [dbc.KYDOS,dbc.DBC,dbc.DAMM,dbc.METADATA]) {
    const pd = PublicKey.findProgramAddressSync([program.toBuffer()],dbc.UPGRADEABLE_LOADER)[0];
    const p = Buffer.alloc(36); p.writeUInt32LE(2); pd.toBuffer().copy(p,4);
    const d = Buffer.alloc(64); d.writeUInt32LE(3); d.writeBigUInt64LE(1n,4); d[45]=127;
    accounts.set(program.toBase58(),info(dbc.UPGRADEABLE_LOADER,p,true)); accounts.set(pd.toBase58(),info(dbc.UPGRADEABLE_LOADER,d));
    hashes[program.toBase58()] = await dbc.sha256(d);
  }
  accounts.set(config.toBase58(),info(dbc.DBC,Buffer.from(configBytes,'base64')));
  window.__DBC_TEST_RELEASE__ = mode === 'unconfigured' ? 'null' : JSON.stringify({enabled:true,genesisHash:state.chain,config:config.toBase58(),programDataHashes:hashes});
  if (mode === 'wrong-network') state.chain = dbc.DEVNET;
  const a = await registerMint(fixtureMint,true);
  const position=Buffer.alloc(408);(await disc('Position')).copy(position);a.pool.toBuffer().copy(position,8);nft.toBuffer().copy(position,40);position.writeBigUInt64LE(1000n,184);
  state.positions=[{pubkey:dbc.positionAddress(nft),account:info(dbc.DAMM,position)}];
  const token=Buffer.alloc(165);AccountLayout.encode({mint:nft,owner:dbc.feeAuthority(),amount:1n,delegateOption:0,
    delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},token);
  accounts.set(dbc.positionNftAccount(nft).toBase58(),info(TOKEN_2022_PROGRAM_ID,token));
  const listeners=new Map();
  window.phantom={solana:{isPhantom:true,isConnected:false,publicKey:null,
    on:(event,fn)=>listeners.set(event,fn),removeListener:event=>listeners.delete(event),
    connect:async()=>{window.phantom.solana.isConnected=true;window.phantom.solana.publicKey=payer.publicKey;return {publicKey:payer.publicKey};},
    disconnect:async()=>{window.phantom.solana.isConnected=false;window.phantom.solana.publicKey=null;listeners.get('disconnect')?.();},
    signTransaction:async tx=>{state.signs++;if(state.reject)throw Object.assign(new Error('User rejected wallet approval'),{code:4001});tx.partialSign(payer);return tx;},
  }};
}
export const connection = {
  getGenesisHash:async()=>state.chain,
  getBlockHeight:async()=>state.height,
  getAccountInfo:async pubkey=>accounts.get(pubkey.toBase58())??null,
  getProgramAccounts:async(_program,options)=>state.positions.filter(p=>new PublicKey(p.account.data.subarray(8,40)).toBase58()===options.filters[1].memcmp.bytes),
  getLatestBlockhash:async()=>({blockhash:key(200).publicKey.toBase58(),lastValidBlockHeight:100}),
  getFeeForMessage:async msg=>{
    let units=0n,price=0n;
    for(const ix of msg.compiledInstructions)if(msg.staticAccountKeys[ix.programIdIndex].toBase58()==='ComputeBudget111111111111111111111111111111'){
      const data=Buffer.from(ix.data);if(data[0]===2)units=BigInt(data.readUInt32LE(1));if(data[0]===3)price=data.readBigUInt64LE(1);
    }
    return {value:msg.header.numRequiredSignatures*5000+Number((units*price+999999n)/1000000n)};
  },
  getBalance:async()=>state.lowBalance?0:1000000000,
  getMinimumBalanceForRentExemption:async size=>size*100,
  simulateTransaction:async tx=>{
    const ix=tx.message.compiledInstructions.at(-1),data=Buffer.from(ix.data);
    const bonding=data.subarray(0,8).equals(Buffer.from(idl.instructions.find(i=>i.name==='claimDbcFees').discriminator));
    const payload=Buffer.alloc(81);Buffer.from(idl.events.find(e=>e.name==='dbcFeesSettled').discriminator).copy(payload);
    const mint=tx.message.staticAccountKeys[ix.accountKeyIndexes[2]];
    mint.toBuffer().copy(payload,8);payload[40]=bonding?0:1;
    (bonding?[0n,100n,0n,100n,0n]:[200n,100n,50n,50n,0n]).forEach((v,i)=>payload.writeBigUInt64LE(v,41+i*8));
    return {value:{err:null,logs:[`Program ${dbc.KYDOS} invoke [1]`,`Program data: ${payload.toString('base64')}`,`Program ${dbc.KYDOS} success`]}};
  },
  sendRawTransaction:async wire=>{
    state.sends++;state.lastWire=Buffer.from(wire).toString('base64');const tx=Transaction.from(wire),ix=tx.instructions.at(-1);
    if(Buffer.from(ix.data).subarray(0,8).equals(Buffer.from(idl.instructions.find(i=>i.name==='launchDbc').discriminator)))await registerMint(ix.keys[2].pubkey);
    if(state.failSend)throw new Error('Transport timeout');return encodeSignature(tx.signature);
  },
  getSignatureStatuses:async()=>({context:{slot:20},value:[{slot:20,confirmationStatus:'confirmed',err:null}]}),
};
export const base44 = {functions:{invoke:async(_name,body)=>{
  if(body.action==='image-upload'){state.images++;return {data:{url:'https://uploads.pinata.cloud/v3/files/test'}};}
  state.metadata++;if(state.failMetadata)throw new Error('Metadata upload interrupted');
  return {data:{metadataUri:'ipfs://bafybeig'+'a'.repeat(40)}};
}}};
