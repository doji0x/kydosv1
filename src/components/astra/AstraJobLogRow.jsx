import React from 'react';
const short=value=>value&&value!=='unknown'?value.slice(0,8):'unknown';
export default function AstraJobLogRow({job}){
 const checkpoint=job.lastCheckpoint||'No checkpoint';
 return <div className="rounded-xl border border-border bg-card p-3">
  <p className="break-all font-mono text-[10px] text-primary">{job.jobUid||job.id} | {job.visibleState||'unknown'} | {job.branch||'unknown'}@{short(job.headCommitSha||job.baseCommitSha)} | step {job.currentStep||0} | {checkpoint} | {job.blocker||'none'}</p>
  <div className="mt-2 flex items-center justify-between gap-3"><strong className="text-xs uppercase tracking-wider">{job.role}</strong><span className="text-xs text-muted-foreground">{job.scope}</span></div>
  {job.changedFiles?.length>0&&<p className="mt-2 line-clamp-2 text-xs text-muted-foreground">Changed: {job.changedFiles.join(', ')}</p>}
  {job.nextStep&&<p className="mt-1 text-xs text-foreground/80">Next: {job.nextStep}</p>}
 </div>;
}