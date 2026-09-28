import React from 'react';
import { Rocket } from 'lucide-react';


export default function SolanaLaunch() {
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
    <div>
      <div className="mb-2 flex items-center gap-2 text-primary"><Rocket className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-[0.2em]">Launch on Kydos</span></div>
      <h1 className="font-display text-3xl font-bold">Coming soon</h1>
      <p className="mt-2 text-sm text-muted-foreground">Public token launches are not available yet. Check back soon.</p>
    </div>
  </main>;
}