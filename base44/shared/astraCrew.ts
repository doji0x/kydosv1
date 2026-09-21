import { callOpenAi } from './astraOpenAi.ts';
import { ASTRA_DELIVERY_POLICY } from './astraDelivery.ts';
import { ASTRA_WORKING_BRANCH, normalizeToolArgs, referenceToolSchemas, repositoryToolSchemas, runTool } from './astraTools.ts';
import { ASTRA_LIMITS } from './astraOrchestration.ts';
import { assertCrewRegistry, crewOrder, CrewRoles, getCrewRole } from './astraRoles.ts';
const MAX_SPECIALIST_STEPS=400;
export { crewOrder }; export const crewRoles=Object.fromEntries(CrewRoles.map(role=>[role.id,role]));
export async function runSpecialist({apiKey,toolsModel,githubToken,base44,role,job,context,log,beforeWrite,recordAuditIssue,repoState,previousCheckpoint}){
 assertCrewRegistry();const spec=getCrewRole(role);if(!spec)throw new Error('Unknown specialist.');
 const readTools=repositoryToolSchemas.filter(x=>['listRepoTree','readFile','createBranch','checkBranchStatus'].includes(x.function.name));
 const auditTool={type:'function',function:{name:'recordAuditIssue',description:'Record a concrete audit finding for owner approval.',parameters:{type:'object',properties:{severity:{type:'string',enum:['high','medium','low']},finding:{type:'string'},proposedFix:{type:'string'},repo:{type:'string'},branch:{type:'string'},filePaths:{type:'array',items:{type:'string'}}},required:['severity','finding','proposedFix','repo','branch','filePaths']}}};
 const tools=[...referenceToolSchemas,...readTools,...(role==='builder'?repositoryToolSchemas.filter(x=>['commitFile','mergeTaskBranch'].includes(x.function.name)):[]),...(role==='audit'?[auditTool]:[])];
 const inspection=`Working tree proxy inspected through GitHub: ${repoState.branch}@${repoState.headSha}; base ${repoState.baseCommitSha}; relevant changes ${(repoState.changedFiles||[]).join(', ')||'none'}. Previous checkpoint: ${previousCheckpoint||'none'}.`;
 const messages=[{role:'system',content:`You are Astra's ${spec.title}. ${spec.brief} The repository is doji0x/kydosv1 and the working branch is ${ASTRA_WORKING_BRANCH}. ${inspection} Continue only unfinished work from the last verified state. Read only files relevant to the checkpoint and changed scope; do not rescan the entire repository or documentation. Trust recorded passing checks when their inputs and head commit are unchanged. After edits, run or inspect focused checks for changed code and required integration checks. Never disable security checks or branch protections, reset, force-push, recreate completed work, or overwrite unrelated changes. ${ASTRA_DELIVERY_POLICY} Work serializes on astra/latest. Treat main-branch changes from another agent as upstream evidence only; require its commit SHA, changed files, test results, and handoff before depending on them. ${role==='builder'?'Own the full implementation and commit complete files only to astra/latest.':'You are the final reviewer and cannot write files.'} ${role==='audit'?'Call recordAuditIssue for every finding.':''} End with a concise implementation summary, checks run, and limitations.`},{role:'user',content:`JOB: ${job}\n\nCONTEXT:\n${context}`}];
 for(let step=1;step<=MAX_SPECIALIST_STEPS;step++){
  const message=await callOpenAi({apiKey,model:toolsModel,messages,tools});messages.push(message);
  if(!message.tool_calls?.length)return String(message.content||'No report.').slice(0,ASTRA_LIMITS.report);
  for(const call of message.tool_calls){const args=JSON.parse(call.function.arguments||'{}');if(!call.function.name.includes('Reference')&&call.function.name!=='recordAuditIssue')normalizeToolArgs(args);const start=Date.now();let result;
   try{if(['commitFile','mergeTaskBranch'].includes(call.function.name))await beforeWrite(args);result=call.function.name==='recordAuditIssue'?await recordAuditIssue(args):await runTool(githubToken,call.function.name,args,base44);}catch(error){result={error:error.message};}
   await log({step,label:`${spec.title} · ${call.function.name}`,toolName:call.function.name,args,detail:`${args.path||args.query||args.id||''} → ${result.error||result.commit||'done'}`,durationMs:Date.now()-start,failed:!!result.error,error:result.error,changedFile:!result.error&&call.function.name==='commitFile'?args.path:'',nextStep:result.error?'Resolve the recorded blocker.':'Continue with the next unfinished step.'});
   messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result).slice(0,ASTRA_LIMITS.toolOutput)});
  }
 }
 throw new Error(`Specialist reached the ${MAX_SPECIALIST_STEPS}-step limit.`);
}