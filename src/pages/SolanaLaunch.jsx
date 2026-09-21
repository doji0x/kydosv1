import React from 'react';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import LaunchEconomics from '@/components/solana/LaunchEconomics';
import { Activity } from '@/lib/solana/Activity';
import { useLaunchFlow } from '@/hooks/useLaunchFlow';

export default function SolanaLaunch(){
 const flow=useLaunchFlow();
 return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
  <div><div className="mb-2 flex items-center gap-2 text-primary"><Rocket className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-[0.2em]">Mainnet launch</span></div><h1 className="font-display text-3xl font-bold">Create the next coin</h1><p className="mt-2 text-sm text-muted-foreground">Launch directly from Phantom into Kydos' bonding curve.</p></div>
  <LaunchEconomics/>
  <Card className="border-primary/20 bg-card/80"><CardHeader><CardTitle>Token details</CardTitle><CardDescription>Use a permanent HTTPS, IPFS, or Arweave metadata URI.</CardDescription></CardHeader><CardContent><form onSubmit={flow.submit} className="space-y-4">
   <label className="space-y-2 text-sm font-medium">Name<Input required value={flow.form.name} disabled={flow.blocked} onChange={flow.set('name')} maxLength={32} placeholder="Kydos Coin"/></label>
   <label className="space-y-2 text-sm font-medium">Ticker<Input required value={flow.form.symbol} disabled={flow.blocked} onChange={flow.set('symbol')} maxLength={10} placeholder="KYDO" className="uppercase"/></label>
   <label className="space-y-2 text-sm font-medium">Metadata URI<Input required value={flow.form.metadataUri} disabled={flow.blocked} onChange={flow.set('metadataUri')} placeholder="https://…/metadata.json"/></label>
   {!flow.wallet.connected?<Button type="button" className="w-full" onClick={flow.connect}>Connect Phantom</Button>:<><p className="break-all rounded-lg bg-secondary/60 p-3 font-mono text-xs">{flow.walletId}</p><Button type="submit" className="w-full gold-glow" disabled={flow.blocked}>{flow.busy?'Awaiting Phantom…':'Launch on mainnet'}</Button></>}
  </form>{flow.rpc.error&&<p role="alert" className="mt-4 text-sm text-destructive">{flow.rpc.error}</p>}{flow.outcome?.wallet===flow.walletId&&<p role="status" className="mt-4 rounded-lg bg-secondary p-3 text-sm">{flow.outcome.message}</p>}</CardContent></Card>
  <Activity activity={flow.activity} connection={flow.rpc.connection}/>
 </main>;
}