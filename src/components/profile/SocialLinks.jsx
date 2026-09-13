import React from "react";
import { Twitter, Github, Instagram, Music2 } from "lucide-react";

export const SOCIALS = [
  { key: "x_handle", label: "X", icon: Twitter, url: (h) => `https://x.com/${h}` },
  { key: "github_handle", label: "GitHub", icon: Github, url: (h) => `https://github.com/${h}` },
  { key: "tiktok_handle", label: "TikTok", icon: Music2, url: (h) => `https://tiktok.com/@${h}` },
  { key: "instagram_handle", label: "Instagram", icon: Instagram, url: (h) => `https://instagram.com/${h}` },
];

export default function SocialLinks({ profile }) {
  const linked = SOCIALS.filter((s) => profile?.[s.key]);
  if (linked.length === 0) return null;

  return (
    <div className="flex items-center gap-2 mt-2.5">
      {linked.map(({ key, label, icon: Icon, url }) => (
        <a
          key={key}
          href={url(profile[key])}
          target="_blank"
          rel="noreferrer"
          title={`${label} · @${profile[key]}`}
          className="h-7 w-7 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition"
        >
          <Icon className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}