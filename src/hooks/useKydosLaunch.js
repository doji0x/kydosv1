import { Contract,Interface,ZeroAddress,hexlify,randomBytes } from "ethers";
import { base44 } from "@/api/base44Client";
import { FACTORY_ABI,V4_FACTORY_ABI } from "@/lib/kydosContracts";
import { useWallet } from "@/lib/WalletContext";
import { TOTAL_SUPPLY,GRADUATION_TARGET } from "@/lib/curve";

export default function useKydosLaunch(){
  const wallet=useWallet();
  return async(form,me)=>{
    const [config]=await base44.entities.KydosConfig.filter({active:true},"-deployed_at",1);
    if(!config) throw new Error("Launchpad contracts have not been deployed yet");
    const signer=await wallet.signer(config.chain_id); const creator=(await signer.getAddress()).toLowerCase();
    const isV4=config.protocol_version==="pons_v4";
    const abi=isV4?V4_FACTORY_ABI:FACTORY_ABI;
    const contract=new Contract(config.factory_address,abi,signer);
    let tx;
    if(isV4){
      const launchConfigId=config.launch_config_id||0;
      const expectedEconomics=await contract.previewLaunchEconomics(launchConfigId,ZeroAddress);
      const params={name:form.name,symbol:form.ticker,logo:form.image_url||"",description:form.description||"",socials:{website:form.website||"",twitter:form.twitter||"",telegram:form.telegram||""},creatorFeeRecipient:creator,creatorTaxBps:form.creator_tax_bps||0,buybackEnabled:form.buyback_enabled!==false,expectedEconomics,salt:hexlify(randomBytes(32))};
      tx=await contract.launchToken(params,launchConfigId,ZeroAddress,{value:await contract.launchFee()});
    }else tx=await contract.createToken(form.name,form.ticker);
    const receipt=await tx.wait();
    const iface=new Interface(abi); const eventName=isV4?"TokenLaunched":"TokenCreated";
    const event=receipt.logs.map((log)=>{try{return iface.parseLog(log);}catch{return null;}}).find((log)=>log?.name===eventName);
    if(!event) throw new Error(`${eventName} event was not found`);
    const tokenAddress=String(event.args.token).toLowerCase(); const curveAddress=String(event.args.curve).toLowerCase();
    const graduationTarget=isV4?Number(event.args.graduationThreshold)/1e18:GRADUATION_TARGET;
    const token=await base44.entities.Token.create({...form,creator,creator_id:me?.id||"",creator_handle:me?.profile?.handle||"",chain_id:config.chain_id,token_address:tokenAddress,curve_address:curveAddress,hook_address:config.hook_address||"",locker_address:config.locker_address||"",tx_hash:receipt.hash,block_number:receipt.blockNumber,total_supply:TOTAL_SUPPLY,graduation_target:graduationTarget,reserve:0,tokens_sold:0,market_cap:0,trade_count:0,holder_count:0,graduation_phase:"curve",status:"live"});
    await Promise.all([base44.entities.RhToken.create({address:tokenAddress,name:form.name,symbol:form.ticker,decimals:18,total_supply:TOTAL_SUPPLY,icon_url:form.image_url,website:form.website,twitter:form.twitter,telegram:form.telegram,tracked:true,market_status:"OK"}),base44.entities.RhPool.create({address:curveAddress,token_address:tokenAddress,venue:"kydos_curve",token0:tokenAddress,token1:isV4?ZeroAddress:config.weth_address,base_is_token0:true,quote_address:isV4?ZeroAddress:config.weth_address,quote_symbol:isV4?"ETH":"WETH",quote_decimals:18,base_decimals:18,launchpad_verified:true,active:true,discovered_at:Date.now(),trust_status:"TRUSTED"})]);
    return token;
  };
}