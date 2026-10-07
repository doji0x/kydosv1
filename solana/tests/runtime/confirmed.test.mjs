import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmed } from './confirmed.mjs';
const failure = { InstructionError: [1, 'InvalidAccountData'] };
function fixture({ err = null, statuses = ['confirmed'], records = [true] } = {}) {
  let s=0, r=0;
  return {
    getSignatureStatuses: async () => ({ value: [statuses[Math.min(s++, statuses.length-1)] === null ? null : {
      confirmationStatus: statuses[Math.min(s-1,statuses.length-1)], slot: 42, err,
    }] }),
    getTransaction: async () => records[Math.min(r++,records.length-1)] ? {
      slot: 42, meta: { err, logMessages: ['Program Kydos invoke [1]'] },
    } : null,
    getBlockHeight: async () => 1,
  };
}
const options={attempts:5,sleep:async()=>{},requiredProgram:'Kydos'};
test('records a genuine successful transaction',async()=>{
  assert.equal((await confirmed(fixture(),'signature',options)).meta.err,null);
});
test('returns confirmed instruction failure as evidence, not thrown websocket data',async()=>{
  assert.deepEqual((await confirmed(fixture({err:failure}),'signature',options)).meta.err,failure);
});
test('waits past processed failure and delayed transaction indexing',async()=>{
  const c=fixture({err:failure,statuses:[null,'processed','confirmed'],records:[false,true]});
  assert.deepEqual((await confirmed(c,'signature',options)).meta.err,failure);
});
test('missing, expired or unindexed transactions cannot pass negative tests',async()=>{
  await assert.rejects(confirmed(fixture({statuses:[null]}),'signature',options),/not established/);
  await assert.rejects(confirmed(fixture({records:[false]}),'signature',options),/not established/);
  await assert.rejects(confirmed(fixture({statuses:[null]}),'signature',{...options,lastValidBlockHeight:0}),/expired/);
});
test('transport exceptions are propagated, never mistaken for program rejection',async()=>{
  const c=fixture(); c.getSignatureStatuses=async()=>{throw new Error('RPC unavailable');};
  await assert.rejects(confirmed(c,'signature',options),/RPC unavailable/);
});
test('requires matching slot, error and real program invocation',async()=>{
  for(const changed of [{slot:41,meta:{err:null,logMessages:['Program Kydos invoke [1]']}},
    {slot:42,meta:{err:failure,logMessages:['Program Kydos invoke [1]']}},
    {slot:42,meta:{err:null,logMessages:[]}}]) {
    const c=fixture();c.getTransaction=async()=>changed;
    await assert.rejects(confirmed(c,'signature',options));
  }
});
