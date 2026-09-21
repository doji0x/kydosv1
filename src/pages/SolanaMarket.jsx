import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { fetchBalances, fetchMarket, trade } from '@/lib/solana/client';
import { mainnetConnection } from '@/lib/solana/development';
import { parseAmount, quoteTrade, transactionError } from '@/lib/solana/market';
import { Activity, useActivity } from '@/lib/solana/Activity';
import MarketStats from '@/components/solana/MarketStats';
import TradePanel from '@/components/solana/TradePanel';

export default function SolanaMarket(){const{mint}=useParams(),wallet=useSolanaWallet();return <Market key={`${mint}:${wallet.publicKey?.toBase58()||''}`} mint={mint} wallet={wallet}/>;}
function Market({mint,wallet}){
 const walletId=wallet.publicKey?.toBase58(),[rpc]=useState(()=>{try{return{connection:mainnetConnection()};}catch(e){return{error:e.message};}}),activity=useActivity(rpc.connection,walletId,`trade:${mint}`);
 const [market,setMarket]=useState(null),[balances,setBalances]=useState(null),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState('');
 const [side,setSide]=useState('buy'),[amount,setAmount]=useState(''),[bps,setBps]=useState(''),[busy,setBusy]=useState(false),[outcome,setOutcome]=useState(null),[now,setNow]=useState(Date.now());
 const generation=useRef(0),lock=useRef(false);
 const refresh=useCallback(async()=>{const request=++generation.current;setLoadError('');setLoading(true);try{if(!rpc.connection)throw new Error(rpc.error);const[value,balance]=await Promise.all([fetchMarket(rpc.connection,mint),walletId?fetchBalances(rpc.connection,walletId,mint):null]);if(request===generation.current){setMarket({...value,loadedAt:Date.now()});setBalances(balance);}}catch(error){if(request===generation.current)setLoadError(error.message);}finally{if(request===generation.current)setLoading(false);}},[rpc,mint,walletId]);
 useEffect(()=>{refresh();return()=>{generation.current++;};},[refresh]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const confirmed=activity.scoped.filter(record=>record.metadata.mint===mint&&['confirmed','failed'].includes(record.state)).map(record=>record.id).join(',');
 useEffect(()=>{if(confirmed){setAmount('');refresh();}},[confirmed,refresh]);
 const stale=market&&now-market.loadedAt>30000;let quote,quoteError='';
 try{if(market&&amount){if(!/^\d+$/.test(bps))throw new Error('Enter integer slippage basis points (100 = 1%)');quote=quoteTrade(market,side,parseAmount(amount,side==='buy'?9:market.decimals),Number(bps));if(balances&&quote.input>(side==='buy'?balances.sol:balances.tokens))throw new Error('Input exceeds confirmed balance');}}catch(error){quoteError=error.message;quote=null;}
 const blocked=busy||activity.blocked;
 const submit=async event=>{event.preventDefault();if(lock.current||blocked||!quote||!balances||!market||!wallet.connected||stale)return;lock.current=true;setBusy(true);setOutcome('Approve the mainnet transaction in Phantom.');try{await trade({connection:rpc.connection,wallet,mint,side,amount:quote.input,minOut:quote.minOut});setOutcome('Trade confirmed on mainnet.');setAmount('');await refresh();}catch(error){setOutcome(transactionError(error));}finally{lock.current=false;setBusy(false);}};
 return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Back to Board</Link><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Mainnet market</p><h1 className="mt-2 font-display text-3xl font-bold">{market?`${market.name} · ${market.symbol}`:'Loading market'}</h1><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{mint}</p></div>{loading&&<p role="status" className="text-sm text-muted-foreground">Loading confirmed market and balances…</p>}{loadError&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{loadError}</p>}<div className="flex gap-2"><Button type="button" variant="outline" disabled={busy||loading} onClick={refresh}><RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh</Button>{!wallet.connected&&<Button onClick={async()=>{try{await wallet.connect();}catch(error){setOutcome(transactionError(error));}}}>Connect Phantom</Button>}</div>{market&&<><MarketStats market={market} balances={balances} stale={stale}/><TradePanel market={market} side={side} setSide={setSide} amount={amount} setAmount={setAmount} bps={bps} setBps={setBps} quote={quote} quoteError={quoteError} blocked={blocked} canSubmit={!blocked&&wallet.connected&&!!balances&&!!quote&&!stale&&!loading} busy={busy} submit={submit}/></>}{outcome&&<p role="status" className="rounded-xl bg-secondary p-4 text-sm">{outcome}</p>}<Link to="/launch" className="block text-center text-sm text-primary hover:underline">Create a Solana market</Link><Activity activity={activity} connection={rpc.connection}/></main>;
}