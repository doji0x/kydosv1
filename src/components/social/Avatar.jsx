import React from "react";
import { Image } from "@/components/ui/image";

export default function Avatar({ src, handle, className = "h-10 w-10" }) {
  return (
    <div className={`${className} shrink-0 rounded-full overflow-hidden bg-muted ring-1 ring-border`}>
      {src ? (
        <Image src={src} alt={handle || ""} className="h-full w-full" />
      ) : (
        <div className="h-full w-full flex items-center justify-center font-display font-bold gold-text uppercase">
          {(handle || "?")[0]}
        </div>
      )}
    </div>
  );
}