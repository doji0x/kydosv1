import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { assertAstraPayload, failureUpdate, managerPlanEffect, reportedJobState, resumeHandoff, scheduledLabel } from '../../shared/astraOrchestration.ts';
export default async function(req:Request):Promise<Response>{try{const base44=createClientFromRequest(req);const user=await base44.auth.me().catch(()=>null);if(user?.role!=='admin')return Response.json({error:'Admin access required.'},{status:403});const results=[];const check=(name,pass)=>results.push({name,pass:!!pass});
 check('failed enqueue',!scheduledLabel(false,1).includes('1 specialist job scheduled'));
 const failed=failureUpdate({lastCheckpoint:'commit abc verified',currentStep:7,changedFiles:['a.js']},'boom');check('execution failure preserves checkpoint',failed.status==='failed'&&failed.lastCheckpoint==='commit abc verified'&&failed.currentStep===7);
 let oversized=false;try{assertAstraPayload({job:'x'.repeat(12001),context:''})}catch{oversized=true}check('oversized payload',oversized);
 const handoff=resumeHandoff({lastCheckpoint:'tests passed',nextStep:'finish docs'},{branch:'astra/latest',headSha:'abc',baseCommitSha:'def',changedFiles:['a.js']});check('restart and resume',handoff.includes('tests passed')&&handoff.includes('astra/latest@abc')&&handoff.includes('finish docs'));
 check('stale status becomes unknown',reportedJobState({status:'running',startedAt:'2020-01-01T00:00:00.000Z'},Date.now())==='unknown');
 const conversational=managerPlanEffect([],true);check('conversation during active work',!conversational.enqueue&&!conversational.cancelPending);
 return Response.json({ok:results.every(x=>x.pass),results});}catch(error){return Response.json({error:error.message},{status:500});}}