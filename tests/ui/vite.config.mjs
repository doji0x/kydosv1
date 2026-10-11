import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = relative => fileURLToPath(new URL(relative,import.meta.url));
export default defineConfig({
  root: path('./'),
  plugins:[react(), {name:'dbc-fixture',resolveId:id=>id==='virtual:dbc-fixture'?'\0dbc-fixture':null,
    load:id=>id==='\0dbc-fixture'?`export default ${JSON.stringify(readFileSync(path('../../solana/dbc/fixtures/controller-config.bin')).toString('base64'))}`:null}],
  resolve:{alias:[
    {find:'@/lib/solana/development',replacement:path('./rpc.js')},
    {find:'@/lib/AuthContext',replacement:path('./auth.js')},
    {find:'@/api/base44Client',replacement:path('./api.js')},
    {find:'@',replacement:path('../../src')},
  ]},
  define:{'import.meta.env.VITE_KYDOS_DBC_RELEASE':'globalThis.__DBC_TEST_RELEASE__'},
  server:{host:'127.0.0.1',port:4177,strictPort:true,fs:{allow:[path('../../')]}},
});
