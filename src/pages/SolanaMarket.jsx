import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { fetchMarket, trade } from '@/lib/solana/client';
import { developmentConnection } from '@/lib/solana/development';
import { formatAmount, parseAmount, quoteTrade, transactionError } from '@/lib/solana/market';
import { checkTransaction } from '@/lib/solana/transactions';

export default function SolanaMarket() {
  const { mint } = useParams();
  // Keyed state prevents an old market/transaction from surviving a route change.
  return <Market key={mint} mint={mint} />;
}

function Market({ mint }) {
  const wallet = useSolanaWallet();
  const [rpc] = useState(() => { try { return { connection: developmentConnection() }; } catch (e) { return { error: e.message }; } });
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [side, setSide] = useState('buy');
  const [amount, setAmount] = useState('');
  const [bps, setBps] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const generation = useRef(0), lock = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setMarket(null); setLoadError(''); setLoading(true);
    try {
      if (!rpc.connection) throw new Error(rpc.error);
      const value = await fetchMarket(rpc.connection, mint);
      if (request === generation.current) setMarket({ ...value, loadedAt: Date.now() });
    } catch (e) { if (request === generation.current) setLoadError(e.message); }
    finally { if (request === generation.current) setLoading(false); }
  }, [rpc, mint]);
  useEffect(() => { refresh(); return () => { generation.current++; }; }, [refresh]);
  // Expire the displayed snapshot even without user input; never silently reprice.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const stale = market && now - market.loadedAt > 30000;
  let quote, quoteError = '';
  try {
    if (market && amount) {
      if (!/^\d+$/.test(bps)) throw new Error('Enter integer slippage basis points (100 bps = 1%)');
      quote = quoteTrade(market, side, parseAmount(amount, side === 'buy' ? 9 : market.decimals), Number(bps));
    }
  } catch (e) { quoteError = e.message; }
  const blocked = busy || outcome?.state === 'unknown';
  const connect = async () => {
    try { await wallet.connect(); } catch (e) { setOutcome({ state: 'error', message: transactionError(e) }); }
  };
  const submit = async e => {
    e.preventDefault();
    if (lock.current || blocked || !quote || !market || !wallet.connected || Date.now() - market.loadedAt > 30000) return;
    lock.current = true; setBusy(true); setOutcome({ state: 'pending', message: 'Approve in your wallet; then wait for confirmation. Do not close this page.' });
    try {
      // Keep the minimum that the user reviewed, not a silently refreshed minimum.
      const signature = await trade({ connection: rpc.connection, wallet, mint, side, amount: quote.input, minOut: quote.minOut });
      setOutcome({ state: 'confirmed', signature, message: 'Transaction confirmed. Refreshing market; output is a quote, not a receipt.' });
      setAmount(''); await refresh();
    } catch (e) { setOutcome({ state: e.state || 'error', signature: e.signature, message: transactionError(e) }); }
    finally { lock.current = false; setBusy(false); }
  };
  const recheck = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await checkTransaction(rpc.connection, outcome.signature);
      setOutcome(result);
      if (result.state === 'confirmed') { setAmount(''); await refresh(); }
    } catch { setOutcome(previous => ({ ...previous, message: 'Status RPC unavailable. Outcome remains unknown; do not resubmit.' })); }
    finally { lock.current = false; setBusy(false); }
  };
  const outputDecimals = side === 'buy' ? market?.decimals : 9;
  return <main className="mx-auto max-w-xl space-y-5 px-4 py-8 pb-24">
    <Link to="/launch/solana">Create a Solana market</Link>
    <h1 className="text-3xl font-semibold">{market ? `${market.name} (${market.symbol})` : 'Solana market'}</h1>
    <p className="text-sm text-muted-foreground">Local development only. Existing program behavior is not approved economics or production readiness. Use test funds only; no external migration is implemented.</p>
    <p className="break-all text-xs">Mint: {mint}</p>
    <p>RPC: localnet (loopback configuration; cluster identity not attested)</p>
    {loading && <p role="status">Loading confirmed Curve account…</p>}
    {loadError && <p role="alert">{loadError}</p>}
    <Button type="button" variant="outline" disabled={busy || loading} onClick={refresh}>Refresh market</Button>
    {market && <>
      <dl className="text-sm space-y-1">
        <dt>Snapshot slot</dt><dd>{market.slot}{stale ? ' — stale: refresh before trading' : ''}</dd>
        <dt>Token reserve</dt><dd>{formatAmount(market.tokenReserve, market.decimals)}</dd>
        <dt>Recorded real SOL reserve</dt><dd>{formatAmount(market.realSolReserve, 9)} SOL</dd>
        <dt>Program graduation flag</dt><dd>{market.graduated ? 'Set — internal pool trading, not external migration' : 'Not set'}</dd>
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
          {quote.acceptedInput !== quote.input && <p>Current threshold caps the estimated input; the instruction still authorizes up to your entered input if reserves change.</p>}
          {quote.willGraduate && <p>This snapshot predicts the program graduation flag will be set.</p>}
          <p>Excludes network fees and possible token-account rent. Balances are not loaded; simulation/on-chain checks enforce funds. Reserves may change before execution.</p>
        </div>}
        {!wallet.connected && <Button type="button" onClick={connect} disabled={blocked}>Connect Phantom</Button>}
        {wallet.connected && <p className="break-all text-xs">Wallet: {wallet.publicKey.toBase58()}</p>}
        <Button type="submit" disabled={blocked || !wallet.connected || !quote || stale || loading}>{busy ? 'Awaiting transaction…' : 'Submit development trade'}</Button>
      </form>
    </>}
    {outcome && <section role="status" aria-live="polite" className="space-y-2 break-words">
      <p>{outcome.message}</p><p className="break-all text-xs">{outcome.signature}</p>
      {outcome.state === 'unknown' && <><p>Keep this signature before leaving. Retry is locked until confirmed or failed status is recovered.</p><Button disabled={busy} onClick={recheck}>Check signature status</Button></>}
    </section>}
  </main>;
}
