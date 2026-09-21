import React from "react";

// Compact pill row used for both the interval selector and the indicator toggles.
export default function ChartPills({ options, isActive, onSelect, size = "sm" }) {
  const h = size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs";
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const key = typeof o === "string" ? o : o.key;
        const label = typeof o === "string" ? o : o.label;
        const on = isActive(key);
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`${h} rounded-full font-mono transition-colors ${
              on
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}