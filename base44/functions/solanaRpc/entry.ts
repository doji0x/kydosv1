import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';

const allowed=new Set(['getAccountInfo','getBalance','getBlockHeight','getBlockTime','getGenesisHash','getLatestBlockhash','getSignatureStatuses','getSignaturesForAddress','getTokenAccountBalance','getTransaction','sendRawTransaction','sendTransaction']);

export default async function(req:Request):Promise<Response>{try{
 if(req.method!=='POST')return Response.json({error:'Use POST.'},{status:405});
 const base44=createClientFromRequest(req),user=await base44.auth.me();
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 const input=await req.json(),method=String(input.method||''),params=Array.isArray(input.params)?input.params.slice(0,5):[];
 if(!allowed.has(method))return Response.json({error:'RPC method not allowed'},{status:400});
 const payload=JSON.stringify({jsonrpc:'2.0',id:1,method:method==='sendRawTransaction'?'sendTransaction':method,params});
 if(payload.length>25000)return Response.json({error:'RPC request is too large'},{status:413});
 const endpoint=secrets.get('HELIUS_RPC_URL');
 if(!endpoint)return Response.json({error:'Helius RPC is not configured'},{status:503});
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:payload}),data=await response.json();
 return Response.json(data,{status:response.ok?200:502});
 }catch(error){return Response.json({error:error.message},{status:500});}
}