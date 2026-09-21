import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const FAUCET = "https://faucet.testnet.chain.robinhood.com";

export default function TestnetFunding() {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    base44.functions.invoke("deployKydosContracts", { mode: "preflight" })
      .then((response) => setStatus(response.data))
      .finally(() => setChecking(false));
  }, []);
  if (checking) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking deployer balance…</p>;
  if (!status) return null;
  return <div className="rounded-lg border border-border bg-background p-3 space-y-2 font-mono text-xs">
    <p className="break-all text-foreground">{status.deployer}</p>
    <p className="text-muted-foreground">Chain {status.chain_id} · Block {status.latest_block}</p>
    <p className={status.balance_eth > 0 ? "text-primary" : "text-destructive"}>Balance {status.balance_eth} ETH</p>
    {status.balance_eth === 0 && <Button asChild size="sm" className="w-full"><a href={FAUCET} target="_blank" rel="noreferrer">Open official faucet <ExternalLink /></a></Button>}
  </div>;
}