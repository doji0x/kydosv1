import { Contract,Interface } from "ethers";
import { base44 } from "@/api/base44Client";
import { FACTORY_ABI } from "@/lib/kydosContracts";
import { useWallet } from "@/lib/WalletContext";
import { TOTAL_SUPPLY,GRADUATION_TARGET } from "@/lib/curve";

export default function useKydosLaunch(){
  const wallet=useWallet();
  return async(form,me)=>{
    const [config]=await base44.entities.KydosConfig.filter({active:true},"-deployed_at",1);
    if(!config) throw new Error("Launchpad contracts have not been deployed yet");
    const signer=await wallet.signer(); const creator=(await signer.getAddress()).toLowerCase();
    const contract=new Contract(config.factory_address,FACTORY_ABI,signer);
    const tx=await contract.createToken(form.name,form.ticker); const receipt=await tx.wait();
    const iface=new Interface(FACTORY_ABI); const event=receipt.logs.map((log)=>{try{return iface.parseLog(log);}catch{return null;}}).find((log)=>log?.name==="TokenCreated");
    if(!event) throw new Error("TokenCreated event was not found");
    const tokenAddress=String(event.args.token).toLowerCase(); const curveAddress=String(event.args.curve).toLowerCase();
    const token=await base44.entities.Token.create({...form,creator,creator_id:me?.id||"",creator_handle:me?.profile?.handle||"",chain_id:46630,token_address:tokenAddress,curve_address:curveAddress,tx_hash:receipt.hash,block_number:receipt.blockNumber,total_supply:TOTAL_SUPPLY,graduation_target:GRADUATION_TARGET,reserve:0,tokens_sold:0,market_cap:0,trade_count:0,holder_count:0,status:"live"});
    await Promise.all([base44.entities.RhToken.create({address:tokenAddress,name:form.name,symbol:form.ticker,decimals:18,total_supply:TOTAL_SUPPLY,icon_url:form.image_url,website:form.website,twitter:form.twitter,telegram:form.telegram,tracked:true,market_status:"OK"}),base44.entities.RhPool.create({address:curveAddress,token_address:tokenAddress,venue:"kydos_curve",token0:tokenAddress,token1:config.weth_address,base_is_token0:true,quote_address:config.weth_address,quote_symbol:"WETH",quote_decimals:18,base_decimals:18,launchpad_verified:true,active:true,discovered_at:Date.now(),trust_status:"TRUSTED"})]);
    return token;
  };
}