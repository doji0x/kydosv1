import { callOpenAi, safeAstraError } from '../../shared/astraOpenAi.ts';
import { auditToolSchemas, referenceToolSchemas, repositoryToolSchemas, runTool, webToolSchemas } from '../../shared/astraTools.ts';
import { ASTRA_WORKING_BRANCH, commitFile, compareRefs, getBranchChecks, getCiLogs, inspectWriteAccess, listCommits, listRepoTree, readFile } from '../../shared/astraGithub.ts';
import { ASTRA_LIMITS } from '../../shared/astraLimits.ts';

export const chatTools=[...repositoryToolSchemas.filter(tool=>['listRepoTree','readFile','checkBranchStatus','listCommits','compareRefs','getCiLogs','inspectWriteAccess','commitFile'].includes(tool.function.name)),...referenceToolSchemas,...webToolSchemas,...auditToolSchemas];
const repo='doji0x/kydosv1';
export async function runManagerWithGithub({apiKey,model,messages,responseFormat,githubToken,base44,headSha,conversationId,log,reasoningEffort,deadline,assertActive}){
 const history=[...messages],readPaths=new Set();let expectedHead=headSha,hadErrors=false;
 for(let step=0;step<60;step++){
  await assertActive();
  const message=await callOpenAi({apiKey,model,messages:history,tools:chatTools,responseFormat,reasoningEffort,deadline});history.push(message);
  if(!message.tool_calls?.length)return {...message,history,hadErrors};
  for(const call of message.tool_calls){
   await assertActive();
   const name=call.function.name;let args={},result;
   try{
    if(!chatTools.some(tool=>tool.function.name===name))throw new Error('This tool is not available in chat.');
    args=JSON.parse(call.function.arguments||'{}');
    if(args.repo&&args.repo!==repo)throw new Error('Chat access is limited to the Kydos repository.');
    if(args.branch&&args.branch!==ASTRA_WORKING_BRANCH)throw new Error('Chat edits are limited to astra/latest.');
    args.repo=repo;args.branch=ASTRA_WORKING_BRANCH;if(name==='recordAuditFinding')args.conversationId=conversationId;
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
     result=await commitFile(githubToken,repo,ASTRA_WORKING_BRANCH,args.path,args.content,args.message,expectedHead);expectedHead=result.commit;
    }else result=await runTool(githubToken,name,args,base44);
   }catch(error){hadErrors=true;result={error:safeAstraError(error)};}
   hadErrors=hadErrors||!!result.error;
   const summary=result.error?`${name} failed: ${result.error}`:result.commit?`Committed ${args.path} → ${result.commit}`:name==='readFile'?`${result.exists===false?'Confirmed missing':'Read'} ${args.path}`:name==='checkBranchStatus'?`Checked ${result.branch}@${result.headSha}: ${JSON.stringify(result.checks)}`:name==='recordAuditFinding'?`Recorded ${args.severity} audit finding`:name==='webSearch'?`Searched public sources for ${String(args.query).slice(0,100)}`:`${name} completed`;
   await log({toolName:name,error:result.error,summary:summary.slice(0,ASTRA_LIMITS.event)});
   const encoded=JSON.stringify(result);
   history.push({role:'tool',tool_call_id:call.id,content:encoded.length<=ASTRA_LIMITS.toolOutput?encoded:JSON.stringify({truncated:true,notice:'Result exceeded the bounded output limit. Use a narrower query; this is only an excerpt.',excerpt:encoded.slice(0,ASTRA_LIMITS.toolOutput-250)})});
  }
 }
 throw new Error('This turn reached its execution limit. Review saved activity and ask to continue.');
}