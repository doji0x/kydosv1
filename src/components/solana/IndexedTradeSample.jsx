import React from 'react';

const compact = value => Number(value).toLocaleString(undefined, { maximumSignificantDigits: 7 });
export default function IndexedTradeSample({ trades, network }) {
  if (!trades.length) return <p className="py-8 text-sm text-muted-foreground">No confirmed trades were parsed yet.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left font-mono text-xs">
    <thead className="border-b border-border text-muted-foreground"><tr><th className="py-3">Time</th><th>Side</th><th>SOL</th><th>Tokens</th><th>Signature</th></tr></thead>
    <tbody>{trades.map(trade => <tr key={trade.eventId || trade.signature} className="border-b border-border/60">
      <td className="py-3 text-muted-foreground">{new Date(trade.blockTime * 1000).toLocaleString()}</td>
      <td className={trade.side === 'buy' ? 'text-emerald-400' : 'text-destructive'}>{trade.side.toUpperCase()}</td>
      <td>{compact(trade.solAmount)}</td><td>{compact(trade.tokenAmount)}</td>
      <td><a className="text-primary hover:underline" href={`https://solscan.io/tx/${trade.signature}${network?.explorerQuery || ''}`} target="_blank" rel="noreferrer">{trade.signature.slice(0, 8)}…</a></td>
    </tr>)}</tbody>
  </table></div>;
}