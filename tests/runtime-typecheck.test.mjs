import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { sourceInventory, compilerConfig, controllerAccountDeclaration, checkRuntimeCoverage } from '../scripts/runtime-typecheck.mjs';

function fixture(t, manifest = {schemaVersion:1, files:{}, archives:[]}) {
  const root = mkdtempSync(join(tmpdir(), 'kydos-coverage-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  const put = (path, value) => { mkdirSync(join(root,path,'..'),{recursive:true}); writeFileSync(join(root,path),value); };
  put('typechecks/historical.json',JSON.stringify(manifest));
  return {root,put};
}
test('coverage enumerates every active runtime and checks generated IDL types', () => {
  const inventory = checkRuntimeCoverage();
  for(const group of ['frontend','backend','tooling','dbc']) assert.ok(inventory[group].length > 0, group);
  assert.equal(readFileSync('solana/dbc/controller-account.d.ts','utf8'),controllerAccountDeclaration());
});
test('unknown files and suppressed active source fail closed', t => {
  const {root,put}=fixture(t);
  put('unexpected/new.js','export const value=1;');
  assert.throws(()=>sourceInventory(root),/not assigned/);
  rmSync(join(root,'unexpected'),{recursive:true});
  put('base44/shared/new.js','// @ts-nocheck\nexport const value=1;');
  assert.throws(()=>sourceInventory(root),/Suppressed/);
});
test('historical source remains byte-pinned and cannot enter the active graph', t => {
  const old='export const old=1;';
  const {root,put}=fixture(t,{schemaVersion:1,files:{'draft/old.js':{sha256:createHash('sha256').update(old).digest('hex'),reason:'fixture'}},archives:[]});
  put('draft/old.js',old); assert.equal(sourceInventory(root).historical.length,1);
  put('base44/shared/new.js',"import '../../draft/old.js';");
  assert.throws(()=>sourceInventory(root),/imports historical/);
  put('base44/shared/new.js','export const okay=1;');put('draft/old.js',old+'\n');
  assert.throws(()=>sourceInventory(root),/Historical source changed/);
});
test('archive manifest detects both content changes and newly added archived code', t => {
  const text='export const old=1;', hash=createHash('sha256').update(text).digest('hex');
  const sourceHash=createHash('sha256').update(JSON.stringify([['archive/old.js',hash]])).digest('hex');
  const {root,put}=fixture(t,{schemaVersion:1,files:{},archives:[{directory:'archive',sourceCount:1,sourceHash,reason:'fixture'}]});
  put('archive/old.js',text);assert.equal(sourceInventory(root).historical.length,1);
  put('archive/new.js',text);assert.throws(()=>sourceInventory(root),/inventory changed/);
  rmSync(join(root,'archive/new.js'));put('archive/old.js',text+'\n');assert.throws(()=>sourceInventory(root),/bytes changed/);
});
test('compiler configuration cannot disable checked JavaScript or enable emission',t=>{
  const {root,put}=fixture(t);put('sample.js','export const okay=1;');
  for(const change of [{checkJs:false},{allowJs:false},{noEmit:false}]){
    put('config.json',JSON.stringify({compilerOptions:{checkJs:true,allowJs:true,noEmit:true,...change},include:['sample.js']}));
    assert.throws(()=>compilerConfig('config.json',root));
  }
});
test('actual runtime contracts accept valid values and reject wrong result/argument types',t=>{
  const directory=mkdtempSync(resolve('typechecks/contract-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const path=join(directory,'test.ts'), options={...compilerConfig('typechecks/node.json').options};
  const imports="import {beforeDeadline} from '../../base44/shared/astraDeadline.ts';\nimport {parseToolArgs} from '../../base44/shared/astraToolArgs.ts';\n";
  const valid="const value=await beforeDeadline(async()=>({count:1,cursor:'next'}),Date.now()+1000,'late');\nconst count:number=value.count;const cursor:string=value.cursor;\nconst args=parseToolArgs({limit:3});const limit:number|undefined=args.limit;\n";
  writeFileSync(path,imports+valid);
  assert.deepEqual(ts.getPreEmitDiagnostics(ts.createProgram([path],options)),[]);
  writeFileSync(path,imports+valid+"const invalid:string=value.count;args.limit='wrong';value.missing;\n");
  const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([path],options));
  assert.equal(diagnostics.length,3);assert.deepEqual(diagnostics.map(d=>d.code).sort(),[2322,2322,2339]);
});
