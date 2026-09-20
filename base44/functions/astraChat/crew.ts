import { callOpenAi } from '../../shared/astraOpenAi.ts';
import { ASTRA_WORKING_BRANCH, normalizeToolArgs, referenceToolSchemas, repositoryToolSchemas, runTool } from './tools.ts';
import { assertCrewRegistry, crewOrder, CrewRoles, getCrewRole } from './roles.ts';

export { crewOrder };
export const crewRoles = Object.fromEntries(CrewRoles.map(role => [role.id, role]));

export async function runSpecialist({apiKey,chatModel,toolsModel,githubToken,base44,role,job,context,log,beforeWrite}) {
 assertCrewRegistry(); const spec=getCrewRole(role); if(!spec) throw new Error('Unknown specialist.'); const tools=[...referenceToolSchemas,...(spec.writes?repositoryToolSchemas.filter(x=>x.function.name==='commitFile'):[])]; const model=toolsModel;
 const messages=[{role:'system',content:`You are Astra's ${spec.title}. ${spec.brief} You cannot browse. You can search the owner-curated reference library. Before implementing or reviewing an unfamiliar external protocol, call searchReferences with precise terms, then readReference for the best matches. ${spec.writes?`Commit complete files only to ${ASTRA_WORKING_BRANCH}. All jobs accumulate on that branch.`:'You cannot write files.'} End with a concise report.`},{role:'user',content:`JOB: ${job}\n\nCONTEXT:\n${context}`}];
 for(let step=0;step<8;step++){ const message=await callOpenAi({apiKey,model,messages,tools}); messages.push(message); if(!message.tool_calls?.length) return message.content||'No report.'; for(const call of message.tool_calls){ const args=JSON.parse(call.function.arguments||'{}'); if(!call.function.name.includes('Reference'))normalizeToolArgs(args); const start=Date.now(); let result; try{if(call.function.name==='commitFile')await beforeWrite(args);result=await runTool(githubToken,call.function.name,args,base44);}catch(error){result={error:error.message};} await log({label:`${spec.title} · ${call.function.name}`,toolName:call.function.name,detail:`${args.path||args.query||args.id||''} → ${result.error||result.commit||'done'}`,durationMs:Date.now()-start,failed:!!result.error,error:result.error}); messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result).slice(0,60000)}); } }
 throw new Error('Specialist reached the step limit.');
}