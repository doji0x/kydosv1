import { useRef, useState } from 'react';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { createLaunch } from '@/lib/solana/client';
import { mainnetConnection } from '@/lib/solana/development';
import { transactionError, validateLaunch } from '@/lib/solana/market';
import { useActivity } from '@/lib/solana/Activity';

export function useLaunchFlow(){
 const wallet=useSolanaWallet(),walletId=wallet.publicKey?.toBase58();
 const [rpc]=useState(()=>{try{return{connection:mainnetConnection()};}catch(e){return{error:e.message};}});
 const activity=useActivity(rpc.connection,walletId,'create');
 const [form,setForm]=useState({name:'',symbol:'',metadataUri:''}),[busy,setBusy]=useState(false),[outcome,setOutcome]=useState(null);
 const lock=useRef(false),blocked=busy||activity.blocked||!rpc.connection;
 const set=key=>event=>setForm(previous=>({...previous,[key]:event.target.value}));
 const connect=async()=>{try{await wallet.connect();}catch(e){setOutcome({wallet:walletId,message:transactionError(e)});}};
 const submit=async event=>{event.preventDefault();if(lock.current||blocked||!wallet.connected)return;lock.current=true;setBusy(true);setOutcome({wallet:walletId,message:'Approve the mainnet transaction in Phantom.'});try{validateLaunch(form);const result=await createLaunch({connection:rpc.connection,wallet,...form});setOutcome({wallet:walletId,message:`Launch confirmed. Mint: ${result.mint}`});setForm({name:'',symbol:'',metadataUri:''});}catch(error){setOutcome({wallet:walletId,message:transactionError(error)});}finally{lock.current=false;setBusy(false);}};
 return{wallet,walletId,rpc,activity,form,busy,outcome,blocked,set,connect,submit};
}