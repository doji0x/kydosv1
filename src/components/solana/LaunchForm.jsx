import React from 'react';
import { Check, Copy, ExternalLink, ImagePlus, Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatAmount } from '@/lib/solana/market';
import { launchTransactionUrl } from '@/lib/solana/launchReview';

export default function LaunchForm({ flow }) {
  const { form, review, result, busy } = flow;
  const disabled = busy || !!review;
  const reviewSection = React.useRef(null);
  React.useEffect(() => { if (review) reviewSection.current?.focus(); }, [review]);
  return <Card className="border-primary/20 bg-card/80">
    <CardHeader><CardTitle>Token details</CardTitle><CardDescription>Create your coin and review the cost before opening Phantom.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/50 p-3 text-sm">
        <p>{flow.availability.network?.name || 'Solana network'} · {flow.availability.programDeployed ? 'Program available' : 'Launch unavailable'}</p>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={flow.refreshAvailability}>Check availability</Button>
      </div>
      <form onSubmit={flow.prepare} className="space-y-4">
        {!form.manualMetadata && <div className="flex items-center gap-4 rounded-xl border border-dashed border-primary/30 bg-secondary/30 p-4">
          {flow.imagePreview ? <img src={flow.imagePreview} alt="Token preview" className="h-20 w-20 shrink-0 rounded-xl object-cover"/> :
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-secondary"><ImagePlus className="h-7 w-7 text-muted-foreground"/></div>}
          <div className="min-w-0 space-y-1"><p className="text-sm font-medium">Token image</p>
            <input id="token-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={flow.chooseImage}
              className="peer sr-only"/>
            <label htmlFor="token-image" className="inline-flex cursor-pointer rounded-md bg-secondary px-3 py-2 text-xs font-medium peer-disabled:cursor-default peer-disabled:opacity-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">{flow.file ? 'Change image' : 'Choose image'}</label>
            {flow.file && <p className="truncate text-xs text-muted-foreground" title={flow.file.name}>{flow.file.name}</p>}
            <p className="text-xs text-muted-foreground">PNG, JPG or WebP · up to 5 MB</p>
          </div>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium" htmlFor="token-name"><span>Name</span><Input id="token-name" required value={form.name} disabled={disabled} onChange={flow.set('name')} maxLength={32} placeholder="Kydos Coin"/></label>
          <label className="block space-y-2 text-sm font-medium" htmlFor="token-symbol"><span>Ticker</span><Input id="token-symbol" required value={form.symbol} disabled={disabled} onChange={flow.set('symbol')} maxLength={10} placeholder="KYDO"/></label>
        </div>
        {!form.manualMetadata && <label className="block space-y-2 text-sm font-medium" htmlFor="token-description"><span>Description <span className="font-normal text-muted-foreground">(optional)</span></span>
          <Textarea id="token-description" value={form.description} disabled={disabled} onChange={flow.set('description')} maxLength={2000} placeholder="What is your coin about?"/>
        </label>}
        <label className="block space-y-2 text-sm font-medium" htmlFor="initial-buy"><span>Initial buy <span className="font-normal text-muted-foreground">(optional)</span></span>
          <div className="relative"><Input id="initial-buy" value={form.initialBuy} inputMode="decimal" disabled={disabled} onChange={flow.set('initialBuy')} className="pr-14" placeholder="0"/><span className="absolute right-3 top-2.5 text-sm text-muted-foreground">SOL</span></div>
          <span className="block text-xs font-normal text-muted-foreground">Includes the 1% Kydos trading fee. Your purchase is part of the creation transaction. Enter 0 to create only.</span>
        </label>
        <details className="rounded-lg border border-border/60 p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">Advanced options</summary>
          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.manualMetadata} disabled={disabled} onChange={flow.set('manualMetadata')}/>Use an existing metadata URI</label>
            {form.manualMetadata && <label className="block space-y-2 text-sm" htmlFor="metadata-uri"><span>Metadata URI</span><Input id="metadata-uri" required value={form.metadataUri} disabled={disabled} onChange={flow.set('metadataUri')} placeholder="https://…/metadata.json"/><span className="block text-xs text-muted-foreground">HTTPS, IPFS or Arweave. This replaces the image and description upload.</span></label>}
            <label className="block space-y-2 text-sm" htmlFor="launch-slippage"><span>Initial buy slippage (%)</span><Input id="launch-slippage" inputMode="decimal" value={form.slippage} disabled={disabled} onChange={flow.set('slippage')} className="max-w-28"/></label>
          </div>
        </details>
        {!review && !result && <>
          {!flow.wallet.connected ? <Button type="button" className="w-full" onClick={flow.connect} disabled={busy}>Connect Phantom</Button> :
            <Button type="submit" className="w-full gold-glow" disabled={!!flow.blockedReason}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>{flow.statusText}</> : 'Review launch'}</Button>}
          {!form.manualMetadata && <p className="text-center text-xs text-muted-foreground">Review uploads your image and details to public IPFS. Uploaded files remain if you cancel the launch.</p>}
        </>}
      </form>

      {review && <section ref={reviewSection} tabIndex={-1} aria-label="Review launch" className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4 focus:outline-none">
        <div className="flex items-center gap-3">{review.imagePreview && <img src={review.imagePreview} alt="Token to launch" className="h-12 w-12 rounded-lg object-cover"/>}
          <div className="min-w-0"><h2 className="break-words font-semibold">{review.name} <span className="text-muted-foreground">${review.symbol}</span></h2><p className="text-xs text-muted-foreground">{review.network.name} · network verified</p></div>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt>Wallet balance on {review.network.name}</dt><dd>{formatAmount(review.costs.balanceLamports, 9)} SOL</dd></div>
          <div className="flex justify-between gap-4"><dt>Initial buy limit</dt><dd>{formatAmount(review.costs.inputLamports, 9)} SOL</dd></div>
          {review.quote.input > 0n && <>
            <div className="flex justify-between gap-4 text-muted-foreground"><dt>1% Kydos fee (included)</dt><dd>{formatAmount(review.quote.feeSol, 9)} SOL</dd></div>
            <div className="flex justify-between gap-4 text-muted-foreground"><dt>Purchase into curve</dt><dd>{formatAmount(review.quote.netSol, 9)} SOL</dd></div>
            <div className="flex justify-between gap-4"><dt>Estimated tokens</dt><dd className="text-right">{formatAmount(review.quote.output, 6)}</dd></div>
            <div className="flex justify-between gap-4 text-muted-foreground"><dt>Minimum tokens ({review.slippage}% slippage)</dt><dd className="text-right">{formatAmount(review.quote.minOut, 6)}</dd></div>
          </>}
          <div className="flex justify-between gap-4"><dt>Account rent</dt><dd>{formatAmount(review.costs.rentLamports, 9)} SOL</dd></div>
          <div className="flex justify-between gap-4"><dt>Metadata creation fee</dt><dd>{formatAmount(review.costs.metadataFeeLamports, 9)} SOL</dd></div>
          <div className="flex justify-between gap-4"><dt>Network fee</dt><dd>{formatAmount(review.costs.networkFeeLamports, 9)} SOL</dd></div>
          <div className="flex justify-between gap-4 border-t border-border pt-3 font-semibold"><dt>Total estimated SOL needed</dt><dd>{formatAmount(review.costs.requiredLamports, 9)} SOL</dd></div>
        </dl>
        {review.quote.acceptedInput < review.quote.input && <p className="text-xs text-muted-foreground">This buy completes the curve. Estimated purchase cost is {formatAmount(review.quote.acceptedInput, 9)} SOL; unused input stays in your wallet.</p>}
        <p className="text-xs text-muted-foreground">One transaction · one Phantom approval. Use {review.network.name} and the connected account in Phantom. The cost and transaction are checked again before signing.</p>
        {!review.costs.sufficient && <p role="alert" className="text-sm text-destructive">You need {formatAmount(review.costs.shortfallLamports, 9)} more native SOL in this wallet on {review.network.name}. Check your Phantom account and network, then review again.</p>}
        <div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" disabled={busy} onClick={flow.edit}>Edit details</Button>
          <Button type="button" className="flex-1 gold-glow" disabled={!!flow.blockedReason || !review.costs.sufficient} onClick={flow.launch}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>{flow.statusText}</> : <><Rocket className="mr-2 h-4 w-4"/>Launch with Phantom</>}</Button>
        </div>
      </section>}

      {result && <section role="status" className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
        <p className="flex items-center gap-2 font-semibold"><Check className="h-5 w-5 text-primary"/>Coin created on {result.network.name}</p>
        <p className="break-all font-mono text-xs">{result.mint}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild><a href={`/solana/${result.mint}`}>Open market</a></Button>
          <Button type="button" variant="outline" onClick={flow.copyMint}><Copy className="mr-2 h-4 w-4"/>{flow.copied ? 'Copied' : 'Copy token address'}</Button>
          <Button variant="outline" asChild><a href={launchTransactionUrl(result.signature, result.network)} target="_blank" rel="noreferrer">View transaction<ExternalLink className="ml-2 h-4 w-4"/></a></Button>
        </div>
        <button type="button" onClick={flow.edit} className="text-xs text-muted-foreground underline">Create another coin</button>
      </section>}
      {flow.blockedReason && !busy && <p role="status" className="text-sm text-muted-foreground">{flow.blockedReason}</p>}
      {flow.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{flow.error}</p>}
      {flow.walletId && <p className="break-all text-xs text-muted-foreground">Wallet: {flow.walletId}</p>}
    </CardContent>
  </Card>;
}
