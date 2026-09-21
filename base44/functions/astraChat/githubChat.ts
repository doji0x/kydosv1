import { callOpenAi } from '../../shared/astraOpenAi.ts';
import { normalizeToolArgs, repositoryToolSchemas, runTool } from '../../shared/astraTools.ts';
import { ASTRA_LIMITS } from '../../shared/astraOrchestration.ts';

const githubReadTools=repositoryToolSchemas.filter(tool=>['listRepoTree','readFile','checkBranchStatus'].includes(tool.function.name));

export async function runManagerWithGithub({apiKey,model,messages,responseFormat,githubToken,base44}){
 const history=[...messages];
 for(let step=0;step<100;step++){
  const message=await callOpenAi({apiKey,model,messages:history,tools:githubReadTools,responseFormat});history.push(message);
  if(!message.tool_calls?.length)return message;
  for(const call of message.tool_calls){
   const args=normalizeToolArgs(JSON.parse(call.function.arguments||'{}'));
   const result=await runTool(githubToken,call.function.name,args,base44);
   history.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result).slice(0,ASTRA_LIMITS.toolOutput)});
  }
 }
 throw new Error('Astra Chat reached the repository inspection limit.');
}