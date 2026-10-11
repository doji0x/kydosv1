import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { assertApprovedBinary } from '../solana/scripts/check-dbc-release.mjs';
const binary=Buffer.from([127,69,76,70,1,2,3,4]);
function data(){const d=Buffer.alloc(80);d.writeUInt32LE(3);binary.copy(d,45);return d;}
test('release preflight matches approved ELF with zero allocation padding',()=>{assertApprovedBinary(data(),binary);});
test('release preflight rejects different deployed code and trailing executable data',()=>{
  const d=data();d[47]^=1;assert.throws(()=>assertApprovedBinary(d,binary),/does not match/);
  const extra=data();extra[79]=1;assert.throws(()=>assertApprovedBinary(extra,binary),/does not match/);
});
test('release preflight rejects truncated or wrong loader state and non-ELF input',()=>{
  assert.throws(()=>assertApprovedBinary(data().subarray(0,49),binary));
  const d=data();d.writeUInt32LE(2);assert.throws(()=>assertApprovedBinary(d,binary));
  assert.throws(()=>assertApprovedBinary(data(),Buffer.from('not ELF')),/ELF/);
});
