import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { buildSolanaRpcPayload } from '../../shared/solanaRpc.js';

export default async function(req:Request):Promise<Response>{try{
 if(req.method!=='POST')return Response.json({error:'Use POST.'},{status:405});
 const base44=createClientFromRequest(req),user=await base44.auth.me();
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 let payload;
 try{payload=buildSolanaRpcPayload(await req.json());}
 catch(error){return Response.json({error:error.message},{status:error.message==='RPC request is too large'?413:400});}
 const endpoint=secrets.get('HELIUS_RPC_URL');
 if(!endpoint)return Response.json({error:'Helius RPC is not configured'},{status:503});
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:payload}),data=await response.json();
 return Response.json(data,{status:response.ok?200:502});
 }catch(error){return Response.json({error:error.message},{status:500});}
}
