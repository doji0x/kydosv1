import React, { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import RhAwaitingIndex from "@/components/rh/RhAwaitingIndex";
import { fetchRhHolders } from "@/lib/rhApi";
import { fmtAmount } from "@/lib/format";
import { shortAddr } from "@/lib/wallet";

export default function RhHolderList({ address }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchRhHolders(address).then(setData);
  }, [address]);

  if (!data) return <Skeleton className="h-32 rounded-2xl" />;
  const holders = data.top_holders || [];
  if (holders.length === 0) return <RhAwaitingIndex label="No holder balances indexed yet" />;

  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      {holders.map((h, i) => (
        <div key={h.wallet} className="flex items-center gap-3 px-3 py-2.5 font-mono text-xs">
          <span className="text-muted-foreground w-5">{i + 1}</span>
          <span>{shortAddr(h.wallet)}</span>
          <span className="ml-auto text-muted-foreground">{fmtAmount(h.balance)}</span>
          <span className="text-primary w-14 text-right">{h.share_pct.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}