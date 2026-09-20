import { callOpenAi } from '../../shared/astraOpenAi.ts';
import { runTool, toolSchemas } from './tools.ts';
export const crewRoles = {
 architect:{title:'ARCHITECT',writes:false,brief:'Map structure and return a concrete file-by-file plan.'},
 logic:{title:'LOGIC / MATH ENGINEER',writes:true,brief:'Implement algorithms, state transitions, and edge cases.'},
 functions:{title:'FUNCTIONS ENGINEER',writes:true,brief:'Implement backend handlers, validation, auth, and response contracts.'},
 integration:{title:'INTEGRATION ENGINEER',writes:true,brief:'Wire modules together and ensure imports and contracts agree.'},
 documentation:{title:'DOCUMENTATION ENGINEER',writes:true,brief:'Document exactly what shipped and how to use it.'},
 audit:{title:'AUDIT / SECURITY',writes:false,brief:'Review security, authorization, validation, secrets, and correctness. Never commit.'}
};
export const crewOrder=Object.keys(crewRoles);
export async function runSpecialist({apiKey,model,githubToken,role,job,context,log,beforeWrite}) {
 const spec=crewRoles[role]; if(!spec) throw new Error('Unknown specialist.'); const tools=spec.writes?toolSchemas.filter(x=>x.function.name==='commitFile'):[];
 const messages=[{role:'system',content:`You are Astra's ${spec.title}. ${spec.brief} You cannot browse. Use only supplied context. ${spec.writes?'Commit complete files only to the named astra/* branch.':'You have no tools.'} End with a concise report.`},{role:'user',content:`JOB: ${job}\n\nCONTEXT:\n${context}`}];
 for(let step=0;step<5;step++){ const message=await callOpenAi({apiKey,model,messages,tools}); messages.push(message); if(!message.tool_calls?.length) return message.content||'No report.'; for(const call of message.tool_calls){ const args=JSON.parse(call.function.arguments||'{}'); const start=Date.now(); let result; try{await beforeWrite(args);result=await runTool(githubToken,call.function.name,args);}catch(error){result={error:error.message};} await log({label:`${spec.title} · ${call.function.name}`,toolName:call.function.name,detail:`${args.path||args.branch||''} → ${result.error||result.commit||'done'}`,durationMs:Date.now()-start,failed:!!result.error,error:result.error}); messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result).slice(0,60000)}); } }
 throw new Error('Specialist reached the step limit.');
}