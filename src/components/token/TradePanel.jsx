import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { quoteBuy, quoteSell, currentPrice, marketCap, fmtTokens, fmtHood, GRADUATION_TARGET } from "@/lib/curve";
import { getWallet } from "@/lib/wallet";
import { useMe } from "@/lib/MeContext";
import { useSignInGate } from "@/lib/SignInGate";
import { cashOf, adjustBalance } from "@/lib/balance";

const PRESETS = [0.1, 0.5, 1, 5];

export default function TradePanel({ token, onTraded, initialSide = "buy" }) {
  const { me, refresh } = useMe();
  const { requireAuth } = useSignInGate();
  const [side, setSide] = useState(initialSide);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const graduated = token.status === "graduated";
  const n = parseFloat(amount) || 0;

  const quote = side === "buy" ? quoteBuy(token, n) : quoteSell(token, n);

  const cash = cashOf(me?.profile);

  const trade = async () => {
    if (n <= 0) return;
    if (!requireAuth(side === "buy" ? "buy" : "sell")) return;
    if (side === "buy" && n > cash) return toast.error(`Not enough HOOD — balance ${fmtHood(cash)}`);
    setBusy(true);
    let reserve, tokens_sold, hood_amount, token_amount;
    if (side === "buy") {
      token_amount = quote; hood_amount = n;
      reserve = (token.reserve || 0) + n; tokens_sold = (token.tokens_sold || 0) + quote;
    } else {
      token_amount = Math.min(n, token.tokens_sold || 0); hood_amount = quote;
      reserve = (token.reserve || 0) - quote; tokens_sold = (token.tokens_sold || 0) - token_amount;
    }
    const next = { ...token, reserve, tokens_sold };
    const cap = marketCap(next);
    const target = token.graduation_target || GRADUATION_TARGET;
    await base44.entities.Trade.create({
      token_id: token.id, ticker: token.ticker, side, hood_amount, token_amount,
      price: currentPrice(next), market_cap: cap, trader: getWallet(), trader_id: me?.id,
    });
    await base44.entities.Token.update(token.id, {
      reserve, tokens_sold, market_cap: cap,
      trade_count: (token.trade_count || 0) + 1,
      holder_count: Math.max(token.holder_count || 0, side === "buy" ? 1 : 0),
      status: reserve >= target ? "graduated" : token.status,
    });
    if (me.profile) {
      await adjustBalance(me.profile, side === "buy" ? -hood_amount : hood_amount);
      await refresh();
    }
    toast.success(side === "buy" ? `Bought ${fmtTokens(token_amount)} $${token.ticker}` : `Sold ${fmtTokens(token_amount)} $${token.ticker}`);
    if (reserve >= target && !graduated) toast(`$${token.ticker} graduated — liquidity locked`, { icon: "🏛️" });
    setAmount("");
    setBusy(false);
    onTraded?.();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted mb-5">
        {["buy", "sell"].map((s) => (
          <button key={s} onClick={() => { setSide(s); setAmount(""); }}
            className={`h-10 rounded-lg text-sm font-semibold capitalize transition-all ${side === s ? (s === "buy" ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground") : "text-muted-foreground hover:text-foreground"}`}>
            {s}
          </button>
        ))}
      </div>

      {graduated ? (
        <p className="text-sm text-muted-foreground text-center py-6">This token has graduated. Trading continues on the DEX pool.</p>
      ) : (
        <>
          <div className="relative">
            <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              className="h-14 bg-background text-xl font-mono pr-20" />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              {side === "buy" ? "HOOD" : `$${token.ticker}`}
            </span>
          </div>
          <div className="flex gap-2 mt-3">
            {side === "buy"
              ? PRESETS.map((p) => <Chip key={p} onClick={() => setAmount(String(p))}>{p} HOOD</Chip>)
              : [25, 50, 100].map((p) => <Chip key={p} onClick={() => setAmount(String(((token.tokens_sold || 0) * p) / 100))}>{p}%</Chip>)}
          </div>
          <div className="mt-4 rounded-xl bg-muted/60 p-3 font-mono text-xs space-y-1.5">
            <Row label="You receive" value={side === "buy" ? `${fmtTokens(quote)} $${token.ticker}` : `${fmtHood(quote)} HOOD`} />
            <Row label="Price" value={`${currentPrice(token).toExponential(3)} HOOD`} />
            {side === "buy" && <Row label="Your balance" value={`${fmtHood(cash)} HOOD`} />}
          </div>
          <Button onClick={trade} disabled={busy || n <= 0}
            className={`w-full h-12 mt-4 rounded-xl font-semibold ${side === "sell" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {side === "buy" ? "Place buy" : "Place sell"}
          </Button>
        </>
      )}
    </div>
  );
}

function Chip({ children, onClick }) {
  return <button type="button" onClick={onClick} className="flex-1 h-8 rounded-lg border border-border text-xs font-mono text-muted-foreground hover:border-primary/50 hover:text-foreground transition">{children}</button>;
}
function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}