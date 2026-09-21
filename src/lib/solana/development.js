import { Connection } from '@solana/web3.js';
import { base44 } from '@/api/base44Client';

const PROXY_ENDPOINT='https://rpc.kydos.invalid';

async function proxyFetch(_url,options={}){
 const request=JSON.parse(options.body||'{}');
 const response=await base44.functions.invoke('solanaRpc',{method:request.method,params:request.params||[]});
 return new Response(JSON.stringify(response.data),{status:200,headers:{'content-type':'application/json'}});
}

export function mainnetConnection(){
 return new Connection(PROXY_ENDPOINT,{commitment:'confirmed',fetch:proxyFetch});
}