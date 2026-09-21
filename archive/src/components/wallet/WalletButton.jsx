import React,{useState} from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@/lib/WalletContext";
import { shortAddr } from "@/lib/wallet";

export default function WalletButton(){
  const wallet=useWallet(); const [busy,setBusy]=useState(false);
  const connect=async()=>{setBusy(true);try{await wallet.connect();}catch(e){toast.error(e.shortMessage||e.message);}finally{setBusy(false);}};
  return <button type="button" onClick={connect} disabled={busy} className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-border bg-card text-[11px] font-mono text-muted-foreground hover:border-primary/50 hover:text-foreground transition"><Wallet className="h-3.5 w-3.5 text-primary"/>{wallet.connected?shortAddr(wallet.address):busy?"Connecting…":"Connect"}</button>;
}