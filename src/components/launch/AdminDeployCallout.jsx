import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck } from "lucide-react";
import TestnetFunding from "@/components/launch/TestnetFunding";

const TESTNET_WETH = "0x7943e237c7F95DA44E0301572D358911207852Fa";

export default function AdminDeployCallout({ isAdmin }) {
  const [active, setActive] = useState(undefined);
  const [weth, setWeth] = useState(TESTNET_WETH);
  const [router, setRouter] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    base44.entities.KydosConfig.filter({ active: true }, "-deployed_at", 1).then((rows) => setActive(rows[0] || null));
  }, [isAdmin]);

  if (!isAdmin) return null;
  const deploy = async () => {
    setDeploying(true); setError("");
    try {
      const response = await base44.functions.invoke("deployKydosContracts", { weth_address: weth, uniswap_router: router.trim() || undefined });
      setResult(response.data); setActive(response.data.config);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setDeploying(false); }
  };

  if (result) return <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 font-mono text-xs"><p className="text-primary">Factory deployed</p><p className="mt-2 break-all">{result.config.factory_address}</p><p className="mt-1 break-all">Curve {result.config.curve_implementation}</p><p className="mt-1 text-muted-foreground break-all">TX {result.config.deployment_tx}</p><p className="mt-1 text-muted-foreground">Balance {result.balance_eth} ETH</p></div>;
  if (active) return null;
  return <section className="rounded-xl border border-primary/30 bg-card/80 p-4 space-y-3">
    <div className="flex gap-3"><ShieldCheck className="h-5 w-5 text-primary shrink-0" /><div><h2 className="text-sm font-semibold">Deploy testnet factory</h2><p className="text-xs text-muted-foreground mt-1">One-time admin setup for Robinhood testnet. V2 graduation stays disabled without a router.</p></div></div>
    <TestnetFunding />
    <Input value={weth} onChange={(e) => setWeth(e.target.value)} aria-label="Testnet WETH address" className="bg-background font-mono text-xs" />
    <Input value={router} onChange={(e) => setRouter(e.target.value)} placeholder="Uniswap V2 router (optional)" aria-label="Uniswap V2 router address" className="bg-background font-mono text-xs" />
    {error && <p className="text-xs text-destructive">{error}</p>}
    <Button type="button" size="sm" onClick={deploy} disabled={deploying || !weth}>{deploying && <Loader2 className="animate-spin" />}Deploy testnet factory</Button>
  </section>;
}