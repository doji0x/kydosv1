import { Connection } from '@solana/web3.js';
import { base44 } from '@/api/base44Client';
import { createProxyFetch } from './rpc.js';

const PROXY_ENDPOINT='https://rpc.kydos.invalid';

const proxyFetch = createProxyFetch((name, body) => base44.functions.invoke(name, body));

export function mainnetConnection(){
 return new Connection(PROXY_ENDPOINT,{commitment:'confirmed',fetch:proxyFetch});
}
