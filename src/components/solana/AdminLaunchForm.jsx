import React, { useEffect, useState } from 'react';
import { Image } from '@/components/ui/image';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function AdminLaunchForm({form,setForm,busy,statusText,onSubmit}) {
  const [preview,setPreview] = useState(''), [imageError,setImageError] = useState('');
  const set = key => event => setForm(previous => ({...previous,[key]:event.target.value}));
  useEffect(() => {
    if (!form.image) { setPreview(''); return; }
    const url = URL.createObjectURL(form.image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form.image]);
  const chooseImage = event => {
    const image = event.target.files?.[0];
    setImageError('');
    if (image && (!['image/png','image/jpeg','image/webp'].includes(image.type) || image.size <= 0 || image.size > 5*1024*1024)) {
      setImageError('Choose a PNG, JPG or WebP image up to 5 MB.');
      event.target.value = ''; setForm(previous => ({...previous,image:null})); return;
    }
    setForm(previous => ({...previous,image:image || null}));
  };
  return <Card className="border-primary/20 bg-card/80">
    <CardHeader><CardTitle>Token details</CardTitle><CardDescription>The protected server wallet will sign and fund this mainnet transaction.</CardDescription></CardHeader>
    <CardContent><form className="space-y-4" onSubmit={onSubmit}>
      <label className="block space-y-2 text-sm font-medium">Name<Input required maxLength={32} value={form.name} disabled={busy} onChange={set('name')} placeholder="Kydos Test Coin"/></label>
      <label className="block space-y-2 text-sm font-medium">Ticker<Input required maxLength={10} value={form.symbol} disabled={busy} onChange={set('symbol')} className="uppercase" placeholder="KYTEST"/></label>
      <div className="space-y-3 rounded-xl border border-dashed border-primary/30 p-4">
        {preview && <Image src={preview} alt="Token photo preview" className="h-24 w-24 rounded-xl" fittingType="fit"/>}
        <label className="block space-y-2 text-sm font-medium">Token photo<Input type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy} onChange={chooseImage}/></label>
        <p className="text-xs text-muted-foreground">PNG, JPG or WebP · up to 5 MB. Your photo and token details will be publicly accessible after upload, even if the launch fails.</p>
        {imageError && <p role="alert" className="text-sm text-destructive">{imageError}</p>}
      </div>
      <Button className="w-full gold-glow" disabled={busy} type="submit"><Rocket className="h-4 w-4"/>{busy?statusText:'Create token on mainnet'}</Button>
    </form></CardContent>
  </Card>;
}