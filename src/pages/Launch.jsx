import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Rocket } from "lucide-react";
import { getWallet } from "@/lib/wallet";
import { TOTAL_SUPPLY, GRADUATION_TARGET } from "@/lib/curve";
import LaunchPreview from "@/components/launch/LaunchPreview";

const empty = { name: "", ticker: "", description: "", image_url: "", website: "", twitter: "", telegram: "" };

export default function Launch() {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: k === "ticker" ? e.target.value.toUpperCase().slice(0, 8) : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const token = await base44.entities.Token.create({
      ...form,
      creator: getWallet(),
      total_supply: TOTAL_SUPPLY,
      graduation_target: GRADUATION_TARGET,
      reserve: 0, tokens_sold: 0, market_cap: 0, trade_count: 0, holder_count: 0, status: "live",
    });
    navigate(`/token/${token.id}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 pb-20">
      <p className="font-mono text-xs tracking-[0.3em] text-primary mb-3">NEW LAUNCH</p>
      <h1 className="font-display text-3xl sm:text-4xl font-bold mb-8">Create your token</h1>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-6">
          <div className="grid sm:grid-cols-[1fr_160px] gap-4">
            <Field label="Name"><Input required value={form.name} onChange={set("name")} placeholder="Kydos Cat" className="h-11 bg-card" /></Field>
            <Field label="Ticker"><Input required value={form.ticker} onChange={set("ticker")} placeholder="KCAT" className="h-11 bg-card font-mono uppercase" /></Field>
          </div>
          <Field label="Description"><Textarea value={form.description} onChange={set("description")} rows={4} placeholder="What is this token about?" className="bg-card resize-none" /></Field>
          <Field label="Image URL"><Input value={form.image_url} onChange={set("image_url")} placeholder="https://…" className="h-11 bg-card" /></Field>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Website"><Input value={form.website} onChange={set("website")} placeholder="optional" className="h-11 bg-card" /></Field>
            <Field label="X / Twitter"><Input value={form.twitter} onChange={set("twitter")} placeholder="optional" className="h-11 bg-card" /></Field>
            <Field label="Telegram"><Input value={form.telegram} onChange={set("telegram")} placeholder="optional" className="h-11 bg-card" /></Field>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground font-mono grid sm:grid-cols-3 gap-3">
            <div><span className="block text-xs">Supply</span><span className="text-foreground">1,000,000,000</span></div>
            <div><span className="block text-xs">Graduation</span><span className="text-foreground">{GRADUATION_TARGET} HOOD</span></div>
            <div><span className="block text-xs">Launch fee</span><span className="text-foreground">Free</span></div>
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