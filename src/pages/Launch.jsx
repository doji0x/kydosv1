import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Rocket, X } from "lucide-react";
import { useMe } from "@/lib/MeContext";
import { GRADUATION_TARGET } from "@/lib/curve";
import LaunchPreview from "@/components/launch/LaunchPreview";
import WalletButton from "@/components/wallet/WalletButton";
import useKydosLaunch from "@/hooks/useKydosLaunch";
import { toast } from "sonner";
import MediaUploadField from "@/components/media/MediaUploadField";
import useGoBack from "@/lib/useGoBack";

const empty = { name: "", ticker: "", description: "", image_url: "", website: "", twitter: "", telegram: "", creator_tax_bps: 0, buyback_enabled: true };

export default function Launch() {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const { me } = useMe();
  const launchToken = useKydosLaunch();
  const set = (k) => (e) => setForm({ ...form, [k]: k === "ticker" ? e.target.value.toUpperCase().slice(0, 8) : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await launchToken(form, me);
      toast.success(`$${token.ticker} launched on Robinhood testnet`);
      navigate(`/token/${token.id}`);
    } catch (error) {
      toast.error(error.shortMessage || error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-2 h-14 flex items-center gap-2">
          <button type="button" onClick={goBack} aria-label="Close" className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-card"><X className="h-5 w-5" /></button>
          <div className="flex-1">
            <p className="font-mono text-[10px] tracking-[0.3em] text-primary leading-none">NEW LAUNCH</p>
            <h1 className="font-display font-semibold leading-tight">Create your token</h1>
          </div>
          <WalletButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 pb-24 grid gap-10 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-6">
          <div className="grid sm:grid-cols-[1fr_160px] gap-4">
            <Field label="Name"><Input required value={form.name} onChange={set("name")} placeholder="Kydos Cat" className="h-11 bg-card" /></Field>
            <Field label="Ticker"><Input required value={form.ticker} onChange={set("ticker")} placeholder="KCAT" className="h-11 bg-card font-mono uppercase" /></Field>
          </div>
          <Field label="Description"><Textarea value={form.description} onChange={set("description")} rows={4} placeholder="What is this token about?" className="bg-card resize-none" /></Field>
          <Field label="Token image">
            <MediaUploadField value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} />
          </Field>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Website"><Input value={form.website} onChange={set("website")} placeholder="optional" className="h-11 bg-card" /></Field>
            <Field label="X / Twitter"><Input value={form.twitter} onChange={set("twitter")} placeholder="optional" className="h-11 bg-card" /></Field>
            <Field label="Telegram"><Input value={form.telegram} onChange={set("telegram")} placeholder="optional" className="h-11 bg-card" /></Field>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-sm font-medium">Buyback and five-year lock</p><p className="text-xs text-muted-foreground mt-1">Route the configured creator fee share into token buybacks and a linear vest.</p></div>
              <Switch checked={form.buyback_enabled} onCheckedChange={(checked) => setForm((f) => ({ ...f, buyback_enabled: checked }))} />
            </div>
            <Field label="Optional creator tax (0–10%)"><Input type="number" min="0" max="10" step="0.1" value={form.creator_tax_bps / 100} onChange={(e) => setForm((f) => ({ ...f, creator_tax_bps: Math.min(1000, Math.max(0, Math.round(Number(e.target.value) * 100))) }))} className="h-11 bg-background font-mono" /></Field>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground font-mono grid sm:grid-cols-3 gap-3">
            <div><span className="block text-xs">Supply</span><span className="text-foreground">1,000,000,000</span></div>
            <div><span className="block text-xs">Graduation</span><span className="text-foreground">{GRADUATION_TARGET} ETH</span></div>
            <div><span className="block text-xs">Quote asset</span><span className="text-foreground">Native ETH</span></div>
          </div>

          <Button type="submit" size="lg" disabled={saving} className="w-full sm:w-auto rounded-full font-semibold px-8 gold-glow">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
            Launch token
          </Button>
        </form>

        <LaunchPreview form={form} />
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}