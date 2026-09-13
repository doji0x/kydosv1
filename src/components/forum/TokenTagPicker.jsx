import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Hash, X } from "lucide-react";

export default function TokenTagPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    if (open && tokens.length === 0) base44.entities.Token.list("-trade_count", 100).then(setTokens);
  }, [open, tokens.length]);

  if (value) {
    return (
      <button type="button" onClick={() => onChange(null)} className="h-8 px-2.5 rounded-full bg-primary/15 text-primary text-xs font-mono flex items-center gap-1">
        ${value.ticker} <X className="h-3 w-3" />
      </button>
    );
  }

  const n = q.toLowerCase();
  const matches = tokens.filter((t) => !n || t.ticker.toLowerCase().includes(n) || t.name.toLowerCase().includes(n)).slice(0, 8);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="h-8 w-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10" aria-label="Tag a token"><Hash className="h-4 w-4" /></button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 bg-card">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tokens" className="h-9 mb-2" />
        <div className="max-h-56 overflow-y-auto">
          {matches.map((t) => (
            <button key={t.id} type="button" onClick={() => { onChange(t); setOpen(false); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-muted flex items-baseline gap-2">
              <span className="font-mono text-xs text-primary">${t.ticker}</span>
              <span className="text-sm truncate">{t.name}</span>
            </button>
          ))}
          {matches.length === 0 && <p className="text-xs text-muted-foreground px-2 py-3">No tokens found.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}