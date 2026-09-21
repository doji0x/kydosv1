import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
const key='astra-conversation-id';
export default function useAstraChat(){
 const [conversationId,setConversationId]=useState(()=>new URLSearchParams(location.search).get('conversation')||localStorage.getItem(key)||crypto.randomUUID());
 const [messages,setMessages]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''); const run=useRef(null);
 const load=useCallback(async id=>{const rows=await base44.entities.AstraMessage.filter({conversationId:id},'-created_date',500);setMessages(rows.reverse());setLoading(false);},[]);
 useEffect(()=>{localStorage.setItem(key,conversationId);setLoading(true);load(conversationId).catch(e=>{setError(e.message);setLoading(false)});const refresh=e=>{if(e.data?.conversationId===conversationId)load(conversationId)};const offMessages=base44.entities.AstraMessage.subscribe(refresh);return offMessages;},[conversationId,load]);
 const send=async(text,payload)=>{if(busy||loading)return;const id=crypto.randomUUID();run.current=id;setBusy(true);setError('');if(!payload)setMessages(x=>[...x,{id:`local-${Date.now()}`,role:'user',content:text}]);try{await base44.functions.invoke('astraChat',{conversationId,requestId:crypto.randomUUID(),...(payload||{message:text})});if(run.current===id)await load(conversationId)}catch(e){if(run.current===id)setError(e.response?.data?.error||e.message)}finally{if(run.current===id){run.current=null;setBusy(false)}}};
 const open=id=>{if(busy)return;setConversationId(id);setMessages([])}; const reset=()=>open(crypto.randomUUID());
 return {conversationId,messages,busy,loading,error,send,open,reset};
}