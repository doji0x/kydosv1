import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/lib/MeContext";
import MediaUploadField from "@/components/media/MediaUploadField";

export default function ProfileEditDialog({ profile, open, onOpenChange }) {
  const { refresh } = useMe();
  const [form, setForm] = useState({
    handle: profile.handle || "",
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) =>
    setForm({ ...form, [k]: k === "handle" ? e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.Profile.update(profile.id, form);
    await base44.auth.updateMe(form);
    await refresh();
    setSaving(false);
    toast.success("Profile updated");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader><DialogTitle className="font-display">Edit profile</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Handle</Label>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span><Input required value={form.handle} onChange={set("handle")} className="h-11 pl-8 bg-background font-mono" /></div></div>
          <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Bio</Label>
            <Textarea value={form.bio} onChange={set("bio")} rows={3} maxLength={160} className="bg-background resize-none" /></div>
          <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Avatar</Label>
            <MediaUploadField value={form.avatar_url} onChange={(url) => setForm((f) => ({ ...f, avatar_url: url }))} /></div>
          <Button type="submit" disabled={saving} className="w-full h-11 rounded-full font-semibold">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}