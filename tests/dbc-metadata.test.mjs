import test from 'node:test';
import assert from 'node:assert/strict';
import { createDbcMetadataSession } from '../src/lib/solana/dbcMetadata.js';
const image = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'token.png',{type:'image/png'});
const cid = 'bafybeig'+'a'.repeat(40), uri = `ipfs://${cid}`;
function harness() {
  const state={images:0,json:0,posts:0,fail:false};
  const args={file:image(),details:{name:'Token',symbol:'TOK',description:'Details'},manualMetadata:false,
    invoke:async(_name,body)=>{if(body.action==='image-upload'){state.images++;return {data:{url:'https://uploads.pinata.cloud/v3/files/test'}};}
      state.json++;if(state.fail)throw new Error('JSON interrupted');return {data:{metadataUri:uri}};},
    fetchImpl:async()=>{state.posts++;return Response.json({data:{cid}});},
  };
  return {state,args,session:createDbcMetadataSession()};
}
test('manual metadata skips uploads and validates the URI',async()=>{
  const h=harness();assert.equal(await h.session.resolve({...h.args,manualMetadata:true,metadataUri:' https://example.com/token.json '}),'https://example.com/token.json');
  assert.equal(h.state.images+h.state.json+h.state.posts,0);
  await assert.rejects(h.session.resolve({...h.args,manualMetadata:true,metadataUri:'javascript:alert(1)'}));
});
test('successful image/JSON uploads are reused when reviewing again',async()=>{
  const h=harness();assert.equal(await h.session.resolve(h.args),uri);assert.equal(await h.session.resolve(h.args),uri);
  assert.deepEqual(h.state,{images:1,json:1,posts:1,fail:false});
});
test('failed metadata retry reuses image CID; changed details upload only new JSON',async()=>{
  const h=harness();h.state.fail=true;await assert.rejects(h.session.resolve(h.args),/interrupted/);
  h.state.fail=false;assert.equal(await h.session.resolve(h.args),uri);
  assert.equal(h.state.images,1);assert.equal(h.state.posts,1);assert.equal(h.state.json,2);
  await h.session.resolve({...h.args,details:{...h.args.details,name:'Different'}});
  assert.equal(h.state.images,1);assert.equal(h.state.json,3);
});
test('different file objects never reuse a different artwork CID',async()=>{
  const h=harness();await h.session.resolve(h.args);await h.session.resolve({...h.args,file:image()});
  assert.equal(h.state.images,2);assert.equal(h.state.posts,2);assert.equal(h.state.json,2);
});
test('stale wallet/form context blocks uploads or further JSON actions',async()=>{
  const h=harness();await assert.rejects(h.session.resolve({...h.args,ensureCurrent:()=>{throw new Error('stale');}}),/stale/);
  assert.equal(h.state.images+h.state.json+h.state.posts,0);
  let current=true;
  await assert.rejects(h.session.resolve({...h.args,ensureCurrent:()=>{if(!current)throw new Error('stale');},fetchImpl:async()=>{
    current=false;return Response.json({data:{cid}});
  }}),/stale/);
  assert.equal(h.state.images,1);assert.equal(h.state.json,0);
});
test('invalid image bytes and overlong UTF-8 details cause no upload',async()=>{
  const h=harness();await assert.rejects(h.session.resolve({...h.args,file:new File(['wrong'],'wrong.png',{type:'image/png'})}),/file type/);
  await assert.rejects(h.session.resolve({...h.args,details:{name:'A'.repeat(33),symbol:'A'}}),/UTF-8/);
  assert.equal(h.state.images+h.state.posts+h.state.json,0);
});
