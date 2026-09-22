import React from 'react';
import { Rocket } from 'lucide-react';
import LaunchEconomics from '@/components/solana/LaunchEconomics';
import LaunchForm from '@/components/solana/LaunchForm';
import { Activity } from '@/lib/solana/Activity';
import { useLaunchFlow } from '@/hooks/useLaunchFlow';

export default function SolanaLaunch() {
  const flow = useLaunchFlow();
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
    <div><div className="mb-2 flex items-center gap-2 text-primary"><Rocket className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-[0.2em]">Launch on Kydos</span></div>
      <h1 className="font-display text-3xl font-bold">Create the next coin</h1><p className="mt-2 text-sm text-muted-foreground">Add your token details, review your launch, then approve in Phantom.</p>
    </div>
    <LaunchForm flow={flow}/>
    <LaunchEconomics/>
    <Activity activity={flow.activity} connection={flow.rpc.connection}/>
  </main>;
}
