import React,{useEffect,useState} from 'react';
import { ShieldAlert } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const tones={high:'border-destructive/40 text-destructive',medium:'border-primary/30 text-primary',low:'border-border text-muted-foreground'};
export default function AstraAuditLogPanel(){
 const [issues,setIssues]=useState([]),[loading,setLoading]=useState(true);
 useEffect(()=>{const load=()=>base44.entities.AstraAuditIssue.list('-created_date',200).then(rows=>{setIssues(rows);setLoading(false)});load();const off=base44.entities.AstraAuditIssue.subscribe(load);return off},[]);
 if(loading)return <p className="text-sm text-muted-foreground">Loading audit findings…</p>;
 if(!issues.length)return <p className="text-sm text-muted-foreground">No audit findings yet.</p>;
 return <div className="space-y-3">{issues.map(issue=><article key={issue.id} className={`rounded-xl border bg-card p-4 ${tones[issue.severity]||tones.low}`}><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><ShieldAlert className="h-4 w-4"/>{issue.severity}</span><span className="text-xs uppercase text-muted-foreground">{issue.status}</span></div><p className="mt-3 text-sm font-medium text-foreground">{issue.finding}</p><p className="mt-2 text-sm text-muted-foreground">{issue.proposedFix}</p><p className="mt-3 break-all font-mono text-xs text-muted-foreground">{issue.branch} · {issue.filePaths?.join(', ')}</p></article>)}</div>;
}