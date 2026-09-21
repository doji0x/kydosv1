import { ASTRA_LIMITS } from './astraOrchestration.ts';

const activitySize = value => JSON.stringify(value).length;
const ordered = rows => [...rows].sort((a,b)=>new Date(a.created_date||0).getTime()-new Date(b.created_date||0).getTime()||Number(a.position||a.step||0)-Number(b.position||b.step||0));
const compact = (value,limit) => { const text=String(value||''); return text.length<=limit?text:`${text.slice(0,Math.max(0,limit-30))}\n[older report compacted]`; };

export function encodeAstraActivity(args,result){
 const payload=JSON.stringify({version:1,args:args||{},result:result||{}});
 return payload.length<=ASTRA_LIMITS.message?payload:JSON.stringify({version:1,args:args||{},result:String(payload).slice(0,ASTRA_LIMITS.message-200),compacted:true});
}

function jobSummary(job,reportLimit=ASTRA_LIMITS.report){
 const checks=(job.checks||[]).map(item=>`${item.name}: ${item.result}`).join('; ')||'none';
 const files=(job.changedFiles||[]).join(', ')||'none';
 const report=compact(job.report||job.summary||job.lastCheckpoint||'No final report recorded.',reportLimit);
 return {role:'assistant',content:`PRIOR BUILDER RUN ${job.jobUid||job.id} (${job.status||'unknown'})\nScope: ${job.scope||job.job||'unspecified'}\nChanged files: ${files}\nChecks: ${checks}\nFinal report:\n${report}`};
}

function activityMessages(activity,index){
 let recorded;
 try{recorded=JSON.parse(activity.detail||'');}catch{recorded=null;}
 if(recorded?.version===1){
  const callId=`replay_${index}_${String(activity.id||'activity').replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  return [{role:'assistant',content:'',tool_calls:[{id:callId,type:'function',function:{name:activity.toolName||'recordedActivity',arguments:JSON.stringify(recorded.args||{})}}]},{role:'tool',tool_call_id:callId,content:JSON.stringify(recorded.result||{})}];
 }
 return [{role:'assistant',content:`PRIOR ACTIVITY ${activity.toolName||'step'}: ${activity.summary||activity.content||'completed'}`}];
}

export async function loadAstraReplay(service,currentJob){
 const conversationId=String(currentJob?.conversationId||'');
 if(!conversationId)return[];
 const [jobRows,activityRows]=await Promise.all([
  service.entities.AstraJob.filter({conversationId},'created_date',200),
  service.entities.AstraMessage.filter({conversationId,role:'activity'},'created_date',500)
 ]);
 const jobs=ordered(jobRows.filter(job=>job.id!==currentJob.id&&!['queued','blocked'].includes(job.status)));
 if(!jobs.length)return[];
 const jobIds=new Set(jobs.map(job=>job.id));
 const activities=ordered(activityRows.filter(item=>jobIds.has(item.jobId)&&item.activityType!=='specialist_start'));
 const budget=ASTRA_LIMITS.replay;
 let summaries=jobs.map(job=>jobSummary(job));
 let mandatorySize=activitySize(summaries);
 if(mandatorySize>budget){
  const perJob=Math.max(600,Math.floor(budget/Math.max(1,jobs.length))-400);
  summaries=jobs.map(job=>jobSummary(job,perJob));
  mandatorySize=activitySize(summaries);
 }
 let remaining=Math.max(0,budget-mandatorySize),selected=[];
 for(let index=activities.length-1;index>=0;index--){
  const messages=activityMessages(activities[index],index),size=activitySize(messages);
  if(size>remaining)continue;
  selected.push({activity:activities[index],messages});remaining-=size;
 }
 const selectedByJob=new Map();
 selected.reverse().forEach(item=>{const list=selectedByJob.get(item.activity.jobId)||[];list.push(...item.messages);selectedByJob.set(item.activity.jobId,list);});
 return jobs.flatMap((job,index)=>[...(selectedByJob.get(job.id)||[]),summaries[index]]);
}