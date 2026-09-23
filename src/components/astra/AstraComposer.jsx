import React,{useState} from 'react';
import { Send,LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
export default function AstraComposer({busy,onSend}){const [text,setText]=useState('');const submit=e=>{e.preventDefault();if(!text.trim()||busy)return;if(onSend(text.trim()))setText('')};return <form onSubmit={submit} className="sticky bottom-20 mt-6 flex gap-2 border-t border-border bg-background/95 py-4 backdrop-blur"><Textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Message Astra…" className="min-h-12 resize-none" disabled={busy}/><Button type="submit" size="icon" disabled={!text.trim()||busy}>{busy?<LoaderCircle className="animate-spin"/>:<Send/>}</Button></form>}