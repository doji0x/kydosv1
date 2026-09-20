import { ASTRA_WORKING_BRANCH, commitFile, createBranch, listRepoTree, readFile } from './astraGithub.ts';
export { ASTRA_WORKING_BRANCH };
export const repositoryToolSchemas=[
 {type:'function',function:{name:'listRepoTree',description:`List repository files from ${ASTRA_WORKING_BRANCH}.`,parameters:{type:'object',properties:{repo:{type:'string'}},required:['repo']}}},
 {type:'function',function:{name:'readFile',description:`Read one repository file from ${ASTRA_WORKING_BRANCH}.`,parameters:{type:'object',properties:{repo:{type:'string'},path:{type:'string'}},required:['repo','path']}}},
 {type:'function',function:{name:'createBranch',description:`Prepare or reuse the shared delivery branch ${ASTRA_WORKING_BRANCH}; return its current commit SHA without resetting it. Not a per-task branch.`,parameters:{type:'object',properties:{repo:{type:'string'}},required:['repo']}}},
 {type:'function',function:{name:'commitFile',description:`Commit complete file contents to ${ASTRA_WORKING_BRANCH}.`,parameters:{type:'object',properties:{repo:{type:'string'},branch:{type:'string',enum:[ASTRA_WORKING_BRANCH]},path:{type:'string'},content:{type:'string'},message:{type:'string'}},required:['repo','path','content','message']}}}
];
export const referenceToolSchemas=[
 {type:'function',function:{name:'searchReferences',description:'Search the owner-curated protocol library.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}}},
 {type:'function',function:{name:'readReference',description:'Read one stored reference.',parameters:{type:'object',properties:{id:{type:'string'}},required:['id']}}}
];
export const toolSchemas=[...repositoryToolSchemas,...referenceToolSchemas];
export function normalizeToolArgs(args={}){const value=String(args.repo||'').trim();args.repo=/^[\w.-]+\/[\w.-]+$/.test(value)&&value!==ASTRA_WORKING_BRANCH?value:'doji0x/kydosv1';args.branch=ASTRA_WORKING_BRANCH;return args;}
export async function runTool(token,name,args,base44){if(name==='searchReferences'){const response=await base44.functions.invoke('astraReference',{action:'search',query:args.query});return response.data;}if(name==='readReference'){const response=await base44.functions.invoke('astraReference',{action:'read',id:args.id});return response.data;}normalizeToolArgs(args);if(name==='listRepoTree'){await createBranch(token,args.repo);return listRepoTree(token,args.repo,ASTRA_WORKING_BRANCH);}if(name==='readFile'){await createBranch(token,args.repo);return readFile(token,args.repo,args.path,ASTRA_WORKING_BRANCH);}if(name==='createBranch')return createBranch(token,args.repo);if(name==='commitFile')return commitFile(token,args.repo,ASTRA_WORKING_BRANCH,args.path,String(args.content||''),args.message);throw new Error(`Unknown tool ${name}`);}
export function activityLabel(name,args){return name==='searchReferences'?`Searching references for ${args.query}`:name==='readReference'?'Reading protocol reference':name==='readFile'?`Reading ${args.path}`:name==='commitFile'?`Committing ${args.path}`:name==='createBranch'?`Preparing ${ASTRA_WORKING_BRANCH}`:`Listing ${args.repo}`;}
