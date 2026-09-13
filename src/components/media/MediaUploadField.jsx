import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import { Loader2, Trash2, UploadCloud, Link2 } from "lucide-react";
import { toast } from "sonner";

const MAX_MB = { image: 10, video: 50 };

export function isVideo(url = "") {
  return /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url);
}

export default function MediaUploadField({ value, onChange, allowVideo = false, className = "" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState("");

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = file.type.startsWith("video") ? "video" : "image";
    if (file.size > MAX_MB[kind] * 1024 * 1024) {
      return toast.error(`${kind === "video" ? "Videos" : "Images"} must be under ${MAX_MB[kind]}MB`);
    }
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      onChange(file_url);
    } catch {
      toast.error("Upload failed — you can paste a media URL instead.");
      setShowUrl(true);
    }
    setBusy(false);
  };

  return (
    <div className={className}>
      {value ? (
        <div className="relative rounded-2xl overflow-hidden border border-border bg-muted">
          {isVideo(value) ? (
            <video src={value} controls className="w-full aspect-video bg-black" />
          ) : (
            <Image src={value} alt="" className="w-full aspect-video" />
          )}
          <button type="button" onClick={() => onChange("")} aria-label="Remove media"
            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="flex-1 h-11 rounded-xl border border-dashed border-border bg-card/60 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {busy ? "Uploading…" : allowVideo ? "Upload image or video" : "Upload image"}
          </button>
          <button type="button" onClick={() => setShowUrl((s) => !s)} aria-label="Paste a URL"
            className="h-11 w-11 shrink-0 rounded-xl border border-border bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <Link2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {!value && showUrl && (
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url.trim() && onChange(url.trim())}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (url.trim()) onChange(url.trim()); } }}
          placeholder="https://… image or video URL"
          className="h-10 mt-2 bg-card"
        />
      )}

      <input ref={inputRef} type="file" accept={allowVideo ? "image/*,video/*" : "image/*"} className="hidden" onChange={pick} />
    </div>
  );
}