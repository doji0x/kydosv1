import React from 'react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import TradePanel from './TradePanel';

export default function TradeDrawer({ open, onOpenChange, trading }) {
  if (!trading.market) return null;
  return <Drawer open={open} onOpenChange={value => { if (!trading.busy) onOpenChange(value); }}>
    <DrawerContent className="mx-auto max-h-[90vh] max-w-xl overflow-y-auto border-primary/25">
      <DrawerHeader><DrawerTitle>Trade {trading.market.symbol}</DrawerTitle><DrawerDescription>Quote against the live Kydos bonding curve and approve in Phantom.</DrawerDescription></DrawerHeader>
      <div className="px-4 pb-8"><TradePanel market={trading.market} side={trading.side} setSide={trading.setSide} amount={trading.amount} setAmount={trading.setAmount}
        bps={trading.bps} setBps={trading.setBps} quote={trading.quote} quoteError={trading.quoteError} blocked={trading.blocked}
        canSubmit={trading.canSubmit} busy={trading.busy} submit={trading.submit}/></div>
    </DrawerContent>
  </Drawer>;
}