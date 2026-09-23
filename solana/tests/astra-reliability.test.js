import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const load = async path => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(path, root), 'utf8')).toString('base64')}`);
const { strictTool } = await load('base44/shared/astraSchemas.ts');
const { compactForModel } = await load('base44/shared/astraLimits.ts');
const { trainingMessages, validateTrainingExample } = await load('base44/shared/astraTraining.ts');
test('strict tools preserve optional semantics with null and forbid unknown keys', () => {
  const result = strictTool({ type:'function', function:{ name:'read', parameters:{type:'object',properties:{id:{type:'string'},limit:{type:'integer'}},required:['id']} } });
  assert.equal(result.function.strict,true); assert.equal(result.function.parameters.additionalProperties,false);
  assert.deepEqual(result.function.parameters.required,['id','limit']); assert.equal(result.function.parameters.properties.limit.anyOf[1].type,'null');
});
test('cumulative context budget never goes negative', () => {
  const budget = {remaining:100}; const first = compactForModel('x'.repeat(1000),'a',1000,budget); const second = compactForModel('y'.repeat(1000),'b',1000,budget);
  assert.ok(first.estimatedTokens + second.estimatedTokens <= 100); assert.ok(budget.remaining >= 0); assert.equal(second.content,'');
});
test('training trace contains actual paired calls but no native reasoning items', () => {
  const call={id:'call_1',type:'function',function:{name:'readFile',arguments:'{"path":"README.md"}'}};
  const messages=trainingMessages([{role:'developer',content:'Read only.'},{role:'user',content:'Read README.'},{role:'assistant',tool_calls:[call],responseItems:[{type:'reasoning',encrypted_content:'private'}]},{role:'tool',tool_call_id:'call_1',content:'{"content":"actual file"}'},{role:'assistant',content:'{"reply":"Read."}'}]);
  assert.equal(messages[0].role,'system');assert.equal(JSON.stringify(messages).includes('encrypted_content'),false);assert.doesNotThrow(()=>validateTrainingExample({messages}));
  assert.throws(()=>validateTrainingExample({messages:messages.filter(x=>x.role!=='tool')}),/Missing tool results/);
});
test('training export rejects obvious secrets and oversized examples', () => {
  assert.throws(()=>validateTrainingExample({messages:[{role:'assistant',content:'sk-proj-'+'a'.repeat(30)}]}),/sensitive/);
  assert.throws(()=>validateTrainingExample({messages:[{role:'assistant',content:'x'.repeat(180001)}]}),/size/);
});