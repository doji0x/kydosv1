import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
const key='astra-conversation-id';
export default function useAstraChat(){
 const [conversationId,setConversationId]=useState(()=>new URLSearchParams(location.search).get('conversation')||localStorage.getItem(key)||crypto.randomUUID());
 const [messages,setMessages]=useState([]),[issues,setIssues]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''); const run=useRef(null);
 const load=useCallback(async id=>{const [m,a]=await Promise.all([base44.entities.AstraMessage.filter({conversationId:id},'-created_date',300),base44.entities.AstraAuditIssue.filter({conversationId:id},'-created_date',100)]);setMessages(m.reverse());setIssues(a.reverse());setLoading(false);},[]);
 useEffect(()=>{localStorage.setItem(key,conversationId);setLoading(true);load(conversationId).catch(e=>{setError(e.message);setLoading(false)});const off=base44.entities.AstraAuditIssue.subscribe(e=>{if(e.data?.conversationId===conversationId)load(conversationId)});return off;},[conversationId,load]);
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>load(conversationId),2000);return()=>clearInterval(timer)},[busy,conversationId,load]);
 const send=async(text,payload)=>{if(busy||loading)return;const id=crypto.randomUUID();run.current=id;setBusy(true);setError('');if(!payload)setMessages(x=>[...x,{id:`local-${Date.now()}`,role:'user',content:text}]);try{await base44.functions.invoke('astraChat',{conversationId,...(payload||{message:text})});if(run.current===id)await load(conversationId)}catch(e){if(run.current===id)setError(e.response?.data?.error||e.message)}finally{if(run.current===id){run.current=null;setBusy(false)}}};
 const open=id=>{if(busy)return;setConversationId(id);setMessages([]);setIssues([])}; const reset=()=>open(crypto.randomUUID()); const pause=()=>{run.current=null;setBusy(false)};
 const decideAudit=(issueId,decision)=>send('',{issueId,decision});
 return {conversationId,messages,auditIssues:issues,busy,loading,error,send,open,reset,pause,decideAudit};
}