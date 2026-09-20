import React from 'react';
import useAstraJobLog from '@/hooks/useAstraJobLog';
import AstraJobLogRow from './AstraJobLogRow';
export default function AstraJobsPanel(){const {jobs,loading}=useAstraJobLog();if(loading)return <p className="text-sm text-muted-foreground">Loading jobs…</p>;if(!jobs.length)return <p className="text-sm text-muted-foreground">No specialist jobs yet.</p>;return <div className="space-y-3">{jobs.map(job=><AstraJobLogRow key={job.id} job={job}/>)}</div>}