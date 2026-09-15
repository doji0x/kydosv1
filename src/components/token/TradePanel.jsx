import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { quoteBuy, quoteSell, currentPrice, marketCap, fmtTokens, fmtHood, GRADUATION_TARGET } from "@/lib/curve";
import { useMe } from "@/lib/MeContext";
import { useSignInGate } from "@/lib/SignInGate";
import useKydosTrade from "@/hooks/useKydosTrade";

const PRESETS = [0.01, 0.05, 0.1, 0.5];

export default function TradePanel({ token, onTraded, initialSide = "buy" }) {
  const { me } = useMe();
  const { requireAuth } = useSignInGate();
  const chain = useKydosTrade(token);
  const [side, setSide] = useState(initialSide);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");
  const n = parseFloat(amount) || 0;
  const quote = side === "buy" ? quoteBuy(token, n) : quoteSell(token, n);
  const target = token.graduation_target || GRADUATION_TARGET;
  const ready = (token.reserve || 0) >= target;

  const trade = async () => {
    if (n <= 0 || !requireAuth(side)) return;
    if (!token.curve_address) return toast.error("This token is not connected to an on-chain curve");
    setBusy("trade");
    try {
      const result = await chain.trade(side, amount);
      const next = { ...token, reserve: result.reserve, tokens_sold: result.sold };
      await Promise.all([
        base44.entities.Trade.create({ token_id: token.id, ticker: token.ticker, side, hood_amount: result.hood, token_amount: result.tokens, price: result.price, market_cap: result.price * token.total_supply, trader: result.trader, trader_id: me?.id }),
        base44.entities.Token.update(token.id, { reserve: result.reserve, tokens_sold: result.sold, market_cap: marketCap(next), trade_count: (token.trade_count || 0) + 1, holder_count: Math.max(token.holder_count || 0, side === "buy" ? 1 : 0) })
      ]);
      toast.success(side === "buy" ? `Bought ${fmtTokens(result.tokens)} $${token.ticker}` : `Sold ${fmtTokens(result.tokens)} $${token.ticker}`);
      setAmount(""); onTraded?.();
    } catch (error) { toast.error(error.shortMessage || error.message); }
    finally { setBusy(""); }
  };

  const graduate = async () => {
    setBusy("graduate");
    try { const pair = await chain.graduate(); await base44.entities.Token.update(token.id, { status: "graduated", uniswap_pair: pair }); toast.success(`$${token.ticker} graduated to Uniswap`); onTraded?.(); }
    catch (error) { toast.error(error.shortMessage || error.message); }
    finally { setBusy(""); }
  };

  return <div className="rounded-2xl border border-border bg-card p-5">
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted mb-5">{["buy", "sell"].map((s) => <button key={s} onClick={() => { setSide(s); setAmount(""); }} className={`h-10 rounded-lg text-sm font-semibold capitalize transition-all ${side === s ? (s === "buy" ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground") : "text-muted-foreground hover:text-foreground"}`}>{s}</button>)}</div>
    <div className="relative"><Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 bg-background text-xl font-mono pr-20"/><span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">{side === "buy" ? "ETH" : `$${token.ticker}`}</span></div>
    {side === "buy" && <div className="flex gap-2 mt-3">{PRESETS.map((p) => <Chip key={p} onClick={() => setAmount(String(p))}>{p} ETH</Chip>)}</div>}
    <div className="mt-4 rounded-xl bg-muted/60 p-3 font-mono text-xs space-y-1.5"><Row label="You receive" value={side === "buy" ? `${fmtTokens(quote)} $${token.ticker}` : `${fmtHood(quote)} ETH`}/><Row label="Price" value={`${currentPrice(token).toExponential(3)} ETH`}/></div>
    <Button onClick={trade} disabled={!!busy || n <= 0} className={`w-full h-12 mt-4 rounded-xl font-semibold ${side === "sell" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}>{busy === "trade" && <Loader2 className="h-4 w-4 mr-2 animate-spin"/>}{side === "buy" ? "Confirm buy in wallet" : "Confirm sell in wallet"}</Button>
    {ready && <Button variant="outline" onClick={graduate} disabled={!!busy} className="w-full h-11 mt-3 rounded-xl">{busy === "graduate" && <Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Graduate to Uniswap</Button>}
  </div>;
}
function Chip({ children, onClick }) { return <button type="button" onClick={onClick} className="flex-1 h-8 rounded-lg border border-border text-xs font-mono text-muted-foreground hover:border-primary/50 hover:text-foreground transition">{children}</button>; }
function Row({ label, value }) { return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>; }