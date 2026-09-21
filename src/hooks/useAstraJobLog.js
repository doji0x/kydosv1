import { useEffect,useState } from 'react';
import { base44 } from '@/api/base44Client';
const staleMs=15*60*1000;
export function visibleState(job){if(!job?.status)return'unknown';if(job.status==='running'&&Date.now()-new Date(job.heartbeatAt||job.startedAt||0).getTime()>staleMs)return'unknown';if(job.status==='completed'&&!job.resultRecordedAt)return'unknown';return job.status;}
export default function useAstraJobLog(){
 const [jobs,setJobs]=useState([]),[loading,setLoading]=useState(true);
 useEffect(()=>{const load=()=>base44.entities.AstraJob.list('-created_date',200).then(rows=>{setJobs(rows.map(job=>({...job,visibleState:visibleState(job)})));setLoading(false)});load();const off=base44.entities.AstraJob.subscribe(load);return off},[]);
 return{jobs,loading};
}