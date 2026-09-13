import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Image } from "@/components/ui/image";
import { ImagePlus, Loader2 } from "lucide-react";
import Avatar from "@/components/social/Avatar";
import TokenTagPicker from "@/components/forum/TokenTagPicker";
import { useMe } from "@/lib/MeContext";
import { createPost } from "@/lib/social";

export default function PostComposer({ token: fixedToken, replyTo, placeholder = "What's happening on the curve?", onPosted }) {
  const { me } = useMe();
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [showImage, setShowImage] = useState(false);
  const [token, setToken] = useState(fixedToken || null);
  const [busy, setBusy] = useState(false);

  if (me === null) {
    return (
      <button onClick={() => base44.auth.redirectToLogin()} className="w-full p-4 text-sm text-primary text-left border-b border-border hover:bg-card/60">
        Sign in to join the conversation →
      </button>
    );
  }
  if (!me) return null;

  const submit = async () => {
    setBusy(true);
    await createPost(me, { body: body.trim(), image_url: image.trim(), token, reply_to: replyTo });
    setBody(""); setImage(""); setShowImage(false);
    if (!fixedToken) setToken(null);
    setBusy(false);
    onPosted?.();
  };

  return (
    <div className="flex gap-3 p-4 border-b border-border">
      <Avatar src={me.profile?.avatar_url} handle={me.profile?.handle} />
      <div className="flex-1 min-w-0">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} rows={2}
          className="border-0 bg-transparent px-0 py-1 text-[15px] resize-none focus-visible:ring-0 placeholder:text-muted-foreground/70 min-h-0" />
        {showImage && <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="Image URL" className="h-9 mt-2 bg-card" />}
        {image && <Image src={image} alt="" className="mt-2 rounded-2xl aspect-video w-full" />}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            {fixedToken ? <span className="h-8 px-2.5 rounded-full bg-primary/15 text-primary text-xs font-mono flex items-center">${fixedToken.ticker}</span> : <TokenTagPicker value={token} onChange={setToken} />}
            <button type="button" onClick={() => setShowImage((s) => !s)} className="h-8 w-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10" aria-label="Add image"><ImagePlus className="h-4 w-4" /></button>
          </div>
          <Button size="sm" onClick={submit} disabled={!body.trim() || busy} className="rounded-full px-5 font-semibold">
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}{replyTo ? "Reply" : "Post"}
          </Button>
        </div>
      </div>
    </div>
  );
}