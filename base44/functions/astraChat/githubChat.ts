import { callOpenAi } from '../../shared/astraOpenAi.ts';
import { referenceToolSchemas, repositoryToolSchemas, runTool } from '../../shared/astraTools.ts';
import { ASTRA_WORKING_BRANCH, commitFile, compareRefs, getBranchChecks, getCiLogs, inspectWriteAccess, listCommits, listRepoTree, readFile } from '../../shared/astraGithub.ts';
import { ASTRA_LIMITS } from '../../shared/astraOrchestration.ts';

const chatTools=[...repositoryToolSchemas.filter(tool=>['listRepoTree','readFile','checkBranchStatus','listCommits','compareRefs','getCiLogs','inspectWriteAccess','commitFile'].includes(tool.function.name)),...referenceToolSchemas];
const repo='doji0x/kydosv1';
export async function runManagerWithGithub({apiKey,model,messages,responseFormat,githubToken,base44,headSha,log}){
 const history=[...messages],readPaths=new Set(),started=Date.now();let expectedHead=headSha;
 for(let step=0;step<250;step++){
  if(Date.now()-started>285000)return {content:JSON.stringify({reply:'This chat turn reached its time limit. Completed operations are recorded above; ask me to continue the remaining work.'})};
  const message=await callOpenAi({apiKey,model,messages:history,tools:chatTools,responseFormat});history.push(message);
  if(!message.tool_calls?.length)return message;
  for(const call of message.tool_calls){
   const name=call.function.name;let args={},result;
   try{
    if(!chatTools.some(tool=>tool.function.name===name))throw new Error('This tool is not available in chat.');
    args=JSON.parse(call.function.arguments||'{}');
    if(args.repo&&args.repo!==repo)throw new Error('Chat access is limited to the Kydos repository.');
    if(args.branch&&args.branch!==ASTRA_WORKING_BRANCH)throw new Error('Chat edits are limited to astra/latest.');
    args.repo=repo;args.branch=ASTRA_WORKING_BRANCH;
    if(['readFile','commitFile'].includes(name)&&(typeof args.path!=='string'||!args.path||args.path.startsWith('/')||args.path.split('/').includes('..')))throw new Error('Provide a valid repository file path.');
    if(name==='readFile'){
     try{result=await readFile(githubToken,repo,args.path,ASTRA_WORKING_BRANCH);if(!result.truncated&&JSON.stringify(result).length<=ASTRA_LIMITS.toolOutput)readPaths.add(args.path);else {readPaths.delete(args.path);result={error:'This file exceeds the complete chat-read limit and cannot safely be rewritten from a partial read.',path:args.path,truncated:true};}}
     catch(error){if(error.status===404){readPaths.add(args.path);result={path:args.path,exists:false};}else throw error;}
    }else if(name==='listRepoTree')result=await listRepoTree(githubToken,repo,ASTRA_WORKING_BRANCH);
     else if(name==='checkBranchStatus')result=await getBranchChecks(githubToken,repo,args.sourceBranch||ASTRA_WORKING_BRANCH);
     else if(name==='listCommits')result=await listCommits(githubToken,repo,ASTRA_WORKING_BRANCH,args.limit);
     else if(name==='compareRefs')result=await compareRefs(githubToken,repo,args.base,ASTRA_WORKING_BRANCH);
     else if(name==='getCiLogs')result=await getCiLogs(githubToken,repo,ASTRA_WORKING_BRANCH,args.runId);
     else if(name==='inspectWriteAccess')result=await inspectWriteAccess(githubToken,repo,ASTRA_WORKING_BRANCH);
     else if(name==='commitFile'){
     if(!readPaths.has(args.path))throw new Error('Read the complete file first, or verify that the new path does not exist.');
     if(typeof args.content!=='string'||args.content.length>120000||typeof args.message!=='string'||!args.message.trim())throw new Error('Provide complete file contents up to 120,000 characters and a commit message.');
     const active=await base44.entities.AstraJob.filter({status:'running'},'created_date',1);
     if(active.length)throw new Error('An earlier specialist job is still marked running. Stop it in Jobs before editing from chat.');
     result=await commitFile(githubToken,repo,ASTRA_WORKING_BRANCH,args.path,args.content,args.message,expectedHead);expectedHead=result.commit;
    }else result=await runTool(githubToken,name,args,base44);
   }catch(error){result={error:error.message};}
   const summary=result.error?`${name} failed: ${result.error}`:result.commit?`Committed ${args.path} → ${result.commit}`:name==='readFile'?`${result.exists===false?'Confirmed missing':'Read'} ${args.path}`:name==='checkBranchStatus'?`Checked ${result.branch}@${result.headSha}: ${JSON.stringify(result.checks)}`:`${name} completed`;
   await log({toolName:name,error:result.error,summary:summary.slice(0,ASTRA_LIMITS.event)});
   history.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result).slice(0,ASTRA_LIMITS.toolOutput)});
  }
 }
 return {content:JSON.stringify({reply:'This chat turn reached its execution limit. Completed operations are recorded above; ask me to continue the remaining work.'})};
}