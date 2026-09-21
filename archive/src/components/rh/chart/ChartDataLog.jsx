import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fmtUsdPrice } from "@/lib/format";

const time = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Flags a bar whose range is wildly off the series median close — the fingerprint of a
// mis-decoded swap rather than a real move.
function audit(bars) {
  const closes = bars.map((b) => b.close).filter(Number.isFinite).sort((a, b) => a - b);
  const median = closes[Math.floor(closes.length / 2)] || 0;
  const outliers = bars.filter((b) => median && (b.high > median * 4 || (b.low > 0 && b.low < median / 4)));
  return { median, outliers };
}

export default function ChartDataLog({ bars = [], timeframe }) {
  const [open, setOpen] = useState(false);
  if (!bars.length) return null;
  const { median, outliers } = audit(bars);
  const rows = bars.slice(-14).reverse();

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 font-mono text-[11px] text-muted-foreground">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Data log · {bars.length} bars @ {timeframe} · median {fmtUsdPrice(median)}
        {outliers.length > 0 && <span className="text-destructive">· {outliers.length} outlier bars</span>}
      </button>
      {open && (
        <div className="max-h-64 overflow-auto border-t border-border px-3 py-2">
          <table className="w-full font-mono text-[10px]">
            <thead className="text-muted-foreground">
              <tr className="text-left"><th className="pr-3">time</th><th className="pr-3">open</th><th className="pr-3">high</th>
                <th className="pr-3">low</th><th className="pr-3">close</th><th className="pr-3">trades</th><th>vol</th></tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const bad = outliers.includes(b);
                return (
                  <tr key={b.t} className={bad ? "text-destructive" : "text-foreground/80"}>
                    <td className="pr-3">{time(b.t)}</td>
                    <td className="pr-3">{fmtUsdPrice(b.open)}</td>
                    <td className="pr-3">{fmtUsdPrice(b.high)}</td>
                    <td className="pr-3">{fmtUsdPrice(b.low)}</td>
                    <td className="pr-3">{fmtUsdPrice(b.close)}</td>
                    <td className="pr-3">{b.trades || 0}</td>
                    <td>{Math.round(b.volume_usd || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}