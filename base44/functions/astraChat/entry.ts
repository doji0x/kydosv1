import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { activityLabel, runTool, toolSchemas } from './tools.ts';
import { buildActivityDigest, buildHistory, nextTurn, summarizeToolArgs, summarizeToolResult } from './memory.ts';
import { crewOrder, crewRoles, runSpecialist } from './crew.ts';
import { createPipeline } from './pipeline.ts';
import { callOpenAi, resolveModel, resolveToolsModel } from '../../shared/astraOpenAi.ts';
import { createAuditSession } from './auditSession.ts';

const managerTools = [...toolSchemas.filter(x => x.function.name !== 'commitFile'),
 {type:'function',function:{name:'assignJob',description:'Assign one scoped job to the next crew specialist.',parameters:{type:'object',properties:{role:{type:'string',enum:crewOrder},job:{type:'string'},context:{type:'string'}},required:['role','job','context']}}},
 {type:'function',function:{name:'recordAuditIssue',description:'Record an audit finding and stop work for owner approval.',parameters:{type:'object',properties:{severity:{type:'string',enum:['high','medium','low']},finding:{type:'string'},proposedFix:{type:'string'},repo:{type:'string'},branch:{type:'string'},filePaths:{type:'array',items:{type:'string'}}},required:['severity','finding','proposedFix','repo','branch','filePaths']}}}
];
const systemPrompt = `You are Astra, the repository engineering foreman for Kydos (default repo doji0x/kydosv1). Survey with listRepoTree/readFile, create one astra/<slug> branch, then delegate sequentially: ${crewOrder.join(' → ')}. Specialists are blind, so include full relevant file contents and earlier reports in context. Only specialists commit. Audit always runs last. Audit findings must be recorded with recordAuditIssue and are NEVER fixed without an owner-button approval. Finish with a short markdown brief naming roles, files, branch and audit result. Cite earlier owner messages as (#N).`;

export default async function(req: Request): Promise<Response> {
 let auditSession;
 try {
  if(req.method!=='POST') return Response.json({error:'Use POST.'},{status:405});
  const base44=createClientFromRequest(req); const user=await base44.auth.me().catch(()=>null);
  if(user?.role!=='admin') return Response.json({error:'Admin access required.'},{status:403});
  const input=await req.json().catch(()=>({})); const conversationId=String(input.conversationId||'').trim();
  if(!conversationId) return Response.json({error:'A conversation id is required.'},{status:400});
  if(input.decision&&!['approve','reject'].includes(input.decision)) return Response.json({error:'Choose approve or reject.'},{status:400});
  const prompt=input.decision?`Audit decision: ${input.decision} for ${input.issueId}.`:String(input.message||'').trim();
  if(!prompt||prompt.length>60000) return Response.json({error:'Send a message up to 60,000 characters.'},{status:400});
  const apiKey=secrets.get('ASTRA_OPENAI_API_KEY'); const chatModel=resolveModel(secrets.get('ASTRA_OPENAI_MODEL')); const toolsModel=resolveToolsModel(secrets.get('ASTRA_TOOLS_MODEL'));
  if(!apiKey) return Response.json({error:'Astra credentials are missing.'},{status:503});
  const {accessToken:githubToken}=await base44.asServiceRole.connectors.getConnection('github');
  auditSession=await createAuditSession(base44,input,user);
  const stored=(await base44.entities.AstraMessage.filter({conversationId},'-created_date',300)).reverse();
  const turn=nextTurn(stored); await base44.entities.AstraMessage.create({conversationId,role:'user',content:prompt,turn,repo:'doji0x/kydosv1'});
  if(auditSession.decision?.status==='rejected') { const reply=await auditSession.revise(apiKey,chatModel); const saved=await base44.entities.AstraMessage.create({conversationId,role:'assistant',content:reply}); await auditSession.finish(saved.id,false,false); return Response.json({reply}); }
  if(auditSession.blocked) return Response.json({error:'Use the pending audit approval card before continuing.'},{status:409});
  const messages=[{role:'system',content:systemPrompt},...(auditSession.directive?[{role:'system',content:auditSession.directive}]:[]),...(buildActivityDigest(stored)?[{role:'system',content:buildActivityDigest(stored)}]:[]),...buildHistory(stored),{role:'user',content:`[#${turn}] ${prompt}`}];
  const pipeline=createPipeline(); let finalText=''; let auditPassed=false; let executionFailed=false;
  const log=async item=>{if(item.failed)executionFailed=true;await base44.entities.AstraMessage.create({conversationId,role:'activity',content:item.failed?`${item.label} — failed: ${item.error}`:item.label,toolName:item.toolName,detail:item.detail,durationMs:item.durationMs,repo:'doji0x/kydosv1'}).catch(()=>{});};
  for(let iteration=0;iteration<20;iteration++){
   const message=await callOpenAi({apiKey,model:toolsModel,messages,tools:managerTools}); messages.push(message);
   if(!message.tool_calls?.length){finalText=message.content||'Run completed.';break;}
   for(const call of message.tool_calls){let args={};try{args=JSON.parse(call.function.arguments||'{}');}catch{} const started=Date.now();let result;
    try{
     if(call.function.name==='assignJob'){
      const claim=pipeline.claim(args.role); if(claim.error) result=claim; else { const report=await runSpecialist({apiKey,chatModel,toolsModel,githubToken,role:args.role,job:args.job,context:args.context,log,beforeWrite:auditSession.assertWrite}); result={role:args.role,skipped:claim.skipped,report}; if(args.role==='audit') auditPassed=/\b(no findings|no issues|clean audit|audit passed)\b/i.test(report) && !/\b(high|medium|low) severity\b/i.test(report); }
     } else if(call.function.name==='recordAuditIssue'){const issue=await auditSession.record(args);pipeline.recordIssue();result={recorded:true,issueId:issue.id};}
     else {await auditSession.assertWrite(args);result=await runTool(githubToken,call.function.name,args);}
    }catch(error){result={error:error.message};}
    await log({label:call.function.name==='assignJob'?`Assigning to ${crewRoles[args.role]?.title||args.role}: ${args.job}`:activityLabel(call.function.name,args),toolName:call.function.name,detail:`${summarizeToolArgs(args)} → ${summarizeToolResult(result)}`,durationMs:Date.now()-started,failed:!!result.error,error:result.error});
    messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result).slice(0,60000)});
   }
   if(pipeline.issues) break;
  }
  if(!finalText) finalText=pipeline.issues?'Audit findings are waiting for your approval below.':'Astra stopped before producing a final brief.';
  const saved=await base44.entities.AstraMessage.create({conversationId,role:'assistant',content:finalText,repo:'doji0x/kydosv1'}); await auditSession.finish(saved.id,auditPassed,executionFailed);
  return Response.json({reply:finalText},{headers:{'Cache-Control':'no-store'}});
 } catch(error){if(auditSession)await auditSession.fail(error.message).catch(()=>{});return Response.json({error:error.message},{status:500});}
}