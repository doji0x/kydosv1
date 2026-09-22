import React from 'react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import TradePanel from './TradePanel';

export default function TradeDrawer({ open, onOpenChange, trading, symbol }) {
  return <Drawer open={open} onOpenChange={value => { if (!trading.busy) onOpenChange(value); }}>
    <DrawerContent className="mx-auto max-h-[90vh] max-w-xl overflow-y-auto border-primary/25">
      <DrawerHeader><DrawerTitle>Trade {trading.market?.symbol || symbol || 'token'}</DrawerTitle><DrawerDescription>Quote against the live Kydos bonding curve and approve in Phantom.</DrawerDescription></DrawerHeader>
      {!trading.market ? <div className="mx-4 mb-8 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm"><p className="font-semibold text-primary">On-chain reserves unavailable</p><p className="mt-1 text-muted-foreground">{trading.loadError || 'Trading will unlock when the reserve snapshot is available.'}</p></div> :
      <div className="px-4 pb-8">{trading.loadError && <p role="alert" className="mb-3 text-sm text-destructive">{trading.loadError}</p>}<TradePanel market={trading.market} side={trading.side} setSide={trading.setSide} amount={trading.amount} setAmount={trading.setAmount}
        bps={trading.bps} setBps={trading.setBps} quote={trading.quote} quoteError={trading.quoteError} blocked={trading.blocked}
        canSubmit={trading.canSubmit} busy={trading.busy} submit={trading.submit}/></div>}
    </DrawerContent>
  </Drawer>;
}