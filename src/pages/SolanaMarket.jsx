import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { fetchMarket, fetchBalances, trade, estimateTradeCosts } from '@/lib/solana/client';
import { developmentConnection } from '@/lib/solana/development';
import { formatAmount, parseAmount, quoteTrade, transactionError } from '@/lib/solana/market';
import { Activity, useActivity } from '@/lib/solana/Activity';

export default function SolanaMarket() {
  const { mint } = useParams();
  const wallet = useSolanaWallet();
  return <Market key={`${mint}:${wallet.publicKey?.toBase58() || ''}`} mint={mint} wallet={wallet} />;
}

function Market({ mint, wallet }) {
  const walletId = wallet.publicKey?.toBase58();
  const [rpc] = useState(() => { try { return { connection: developmentConnection() }; } catch (e) { return { error: e.message }; } });
  const activity = useActivity(rpc.connection, walletId, `trade:${mint}`);
  const [market, setMarket] = useState(null), [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState('');
  const [side, setSide] = useState('buy'), [amount, setAmount] = useState(''), [bps, setBps] = useState('');
  const [busy, setBusy] = useState(false), [outcome, setOutcome] = useState(null);
  const [estimate, setEstimate] = useState(null), [retry, setRetry] = useState(0);
  const generation = useRef(0), lock = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setMarket(null); setBalances(null); setLoadError(''); setLoading(true);
    try {
      if (!rpc.connection) throw new Error(rpc.error);
      const [value, balance] = await Promise.all([fetchMarket(rpc.connection, mint), walletId ? fetchBalances(rpc.connection, walletId, mint) : null]);
      if (request === generation.current) { setMarket({ ...value, loadedAt: Date.now() }); setBalances(balance); }
    } catch (e) { if (request === generation.current) setLoadError(e.message); }
    finally { if (request === generation.current) setLoading(false); }
  }, [rpc, mint, walletId]);
  useEffect(() => { refresh(); return () => { generation.current++; }; }, [refresh]);
  // Includes confirmations recovered after navigation or in another tab.
  const confirmed = activity.scoped.filter(r => r.metadata.mint === mint && ['confirmed', 'failed'].includes(r.state)).map(r => r.id).join(',');
  useEffect(() => { if (confirmed) { setAmount(''); refresh(); } }, [confirmed, refresh]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const stale = Boolean(market && now - market.loadedAt > 30000);
  let quote, quoteError = '';
  try {
    if (market && amount) {
      if (!/^\d+$/.test(bps)) throw new Error('Enter integer slippage basis points (100 bps = 1%)');
      quote = quoteTrade(market, side, parseAmount(amount, side === 'buy' ? 9 : market.decimals), Number(bps));
      // Keep the quote for a SOL shortfall preview, but still block submission.
      if (balances && quote.input > (side === 'buy' ? balances.sol : balances.tokens)) quoteError = 'Input exceeds confirmed balance';
    }
  } catch (e) { quoteError = e.message; quote = null; }
  const blocked = busy || activity.blocked;
  const validEstimate = Boolean(quote && balances && wallet.connected && walletId && rpc.connection && !stale && !loading);
  const estimateKey = JSON.stringify([walletId, wallet.connected, mint, side, amount, bps, quote?.input.toString(), quote?.minOut.toString(), market?.loadedAt, stale, loading, retry, busy]);
  useEffect(() => {
    let cancelled = false;
    setEstimate(null);
    if (validEstimate && !busy) {
      estimateTradeCosts({ connection: rpc.connection, wallet, mint, side, amount: quote.input, minOut: quote.minOut }).then(
        costs => { if (!cancelled) setEstimate({ key: estimateKey, costs }); },
        error => { if (!cancelled) setEstimate({ key: estimateKey, error: transactionError(error) }); },
      );
    }
    return () => { cancelled = true; };
  }, [estimateKey, validEstimate, rpc.connection]);
  const currentEstimate = estimate?.key === estimateKey ? estimate : null;
  const costs = currentEstimate?.costs;
  const submit = async e => {
    e.preventDefault();
    if (lock.current || blocked || !costs?.sufficient || quoteError || !quote || !balances || !market || !wallet.connected || Date.now() - market.loadedAt > 30000) return;
    lock.current = true; setBusy(true); setOutcome('Rechecking costs before wallet approval. Recovery is persisted before broadcast.');
    try {
      await trade({ connection: rpc.connection, wallet, mint, side, amount: quote.input, minOut: quote.minOut });
      setOutcome('Confirmed. Refreshing balances and market; quotes are not receipts.');
      setAmount(''); await refresh();
    } catch (e) { setOutcome(transactionError(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  const outputDecimals = side === 'buy' ? market?.decimals : 9;
  return <main className="mx-auto max-w-xl space-y-5 px-4 py-8 pb-24">
    <Link to="/launch/solana">Create a Solana market</Link>
    <h1 className="text-3xl font-semibold">{market ? `${market.name} (${market.symbol})` : 'Solana market'}</h1>
    <p className="text-sm text-muted-foreground">Local development only. Existing program behavior is not approved economics or production readiness. Disposable test funds only; no external migration.</p>
    <p className="break-all text-xs">Mint: {mint}</p>
    <p className="break-all text-xs">Local RPC genesis: {activity.chain || 'unavailable'}</p>
    {loading && <p role="status">Loading confirmed market and balances…</p>}
    {loadError && <p role="alert">{loadError}</p>}
    <Button type="button" variant="outline" disabled={busy || loading} onClick={refresh}>Refresh market and balances</Button>
    {!wallet.connected && <Button type="button" onClick={async () => { try { await wallet.connect(); } catch (e) { setOutcome(transactionError(e)); } }}>Connect Phantom</Button>}
    {wallet.connected && <p className="break-all text-xs">Wallet: {walletId}</p>}
    {market && <>
      <dl className="text-sm space-y-1">
        <dt>Snapshot slot</dt><dd>{market.slot}{stale ? ' — stale: refresh before trading' : ''}</dd>
        <dt>Token reserve</dt><dd>{formatAmount(market.tokenReserve, market.decimals)}</dd>
        <dt>Recorded real SOL reserve</dt><dd>{formatAmount(market.realSolReserve, 9)} SOL</dd>
        <dt>Program graduation flag</dt><dd>{market.graduated ? 'Set — internal pool, not external migration' : 'Not set'}</dd>
        {balances && <><dt>Confirmed wallet balances</dt><dd>{formatAmount(balances.sol, 9)} SOL / {formatAmount(balances.tokens, market.decimals)} {market.symbol}</dd></>}
      </dl>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">Side<select className="block bg-background border p-2" value={side} disabled={blocked} onChange={e => { setSide(e.target.value); setAmount(''); }}><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <label className="block">Input ({side === 'buy' ? 'SOL' : market.symbol})<Input inputMode="decimal" value={amount} disabled={blocked} onChange={e => setAmount(e.target.value)} /></label>
        <label className="block">Slippage (integer bps; 100 = 1%)<Input inputMode="numeric" value={bps} disabled={blocked} onChange={e => setBps(e.target.value)} placeholder="Choose 0–9999" /></label>
        {quoteError && <p role="alert">{quoteError}</p>}
        {quote && <div className="text-sm space-y-1">
          <p>Estimated output: {formatAmount(quote.output, outputDecimals)} {side === 'buy' ? market.symbol : 'SOL'}</p>
          <p>Minimum output: {formatAmount(quote.minOut, outputDecimals)} ({Number(bps) / 100}% tolerance)</p>
          <p>Estimated accepted input: {formatAmount(quote.acceptedInput, side === 'buy' ? 9 : market.decimals)}</p>
          {quote.acceptedInput !== quote.input && <p>The threshold caps estimated input; the instruction still authorizes up to your entered input if reserves change.</p>}
          {quote.willGraduate && <p>This snapshot predicts the program graduation flag will be set.</p>}
          <p>Cost estimates include network fees and required account rent, with the full authorized buy input. Sale proceeds cannot pay upfront fees. RPC snapshots can change; costs are rechecked before signing. Minimum output is never silently repriced.</p>
        </div>}
        {validEstimate && !busy && !currentEstimate && <p role="status">Estimating transaction costs…</p>}
        {currentEstimate?.error && <p role="alert">Cost estimate unavailable: {currentEstimate.error}</p>}
        {costs && <dl className="text-sm space-y-1">
          {side === 'buy' && <><dt>Full authorized buy input</dt><dd>{formatAmount(costs.inputLamports, 9)} SOL</dd></>}
          <dt>Estimated network fee</dt><dd>{formatAmount(costs.networkFeeLamports, 9)} SOL</dd>
          <dt>Account rent</dt><dd>{formatAmount(costs.rentLamports, 9)} SOL</dd>
          <dt>Total required</dt><dd>{formatAmount(costs.requiredLamports, 9)} SOL</dd>
          <dt>Available</dt><dd>{formatAmount(costs.balanceLamports, 9)} SOL</dd>
          <dt>Shortfall</dt><dd>{formatAmount(costs.shortfallLamports, 9)} SOL</dd>
        </dl>}
        <Button type="button" variant="outline" disabled={!validEstimate || busy} onClick={() => setRetry(value => value + 1)}>Refresh cost estimate</Button>
        <Button type="submit" disabled={blocked || !wallet.connected || !balances || !quote || Boolean(quoteError) || stale || loading || !costs?.sufficient}>{busy ? 'Awaiting transaction…' : 'Submit development trade'}</Button>
      </form>
    </>}
    {outcome && <p role="status">{outcome}</p>}
    <Activity activity={activity} connection={rpc.connection} />
  </main>;
}
