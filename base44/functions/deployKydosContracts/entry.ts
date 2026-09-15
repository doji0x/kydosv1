import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } from "npm:ethers@6.15.0";
import artifact from "../../shared/kydosArtifact.json" with { type: "json" };

const ROUTER_ABI=["function factory() view returns(address)","function WETH() view returns(address)"];
const V4={poolManager:"0x8366a39cc670b4001a1121b8f6a443a643e40951",positionManager:"0x58daec3116aae6d93017baaea7749052e8a04fa7",stateView:"0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",universalRouter:"0x8876789976decbfcbbbe364623c63652db8c0904",permit2:"0x000000000022D473030F116dDEE9F6B43aC78BA3"};

export default async function(req: Request): Promise<Response> {
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user) return Response.json({error:"Unauthorized"},{status:401});
    if(user.role!=="admin") return Response.json({error:"Forbidden"},{status:403});
    const body=await req.json().catch(()=>({}));
    const provider=new JsonRpcProvider(secrets.get("RH_RPC_URL"));
    const network=await provider.getNetwork();
    const db=base44.asServiceRole;

    if(body.mode==="register_v4") {
      if(Number(network.chainId)!==4663) return Response.json({error:`RH_RPC_URL must target Robinhood mainnet (4663), received ${network.chainId}`},{status:400});
      const required=["factory_address","launch_deployer","hook_address","locker_address","fee_escrow_address","buyback_vault_address","graduation_executor"];
      const missing=required.filter((key)=>!body[key]);
      if(missing.length) return Response.json({error:`Missing ${missing.join(", ")}`},{status:400});
      const custom=Object.fromEntries(required.map((key)=>[key,getAddress(body[key]).toLowerCase()]));
      const checked={...custom,v4_pool_manager:V4.poolManager,v4_position_manager:V4.positionManager,v4_state_view:V4.stateView,v4_universal_router:V4.universalRouter,v4_permit2:V4.permit2};
      const absent=[];
      for(const [name,address] of Object.entries(checked)) if(await provider.getCode(address)==="0x") absent.push(name);
      if(absent.length) return Response.json({error:`No contract bytecode at ${absent.join(", ")}`},{status:400});
      const active=await db.entities.KydosConfig.filter({active:true});
      await Promise.all(active.map((row)=>db.entities.KydosConfig.update(row.id,{active:false})));
      const config=await db.entities.KydosConfig.create({chain_id:4663,protocol_version:"pons_v4",...checked,launch_config_id:Number(body.launch_config_id)||0,deployment_tx:String(body.deployment_tx||""),deployment_block:Number(body.deployment_block)||0,deployed_at:Date.now(),active:true});
      return Response.json({config,official_uniswap_v4:true});
    }

    if(!body.uniswap_router || !body.weth_address) return Response.json({error:"uniswap_router and weth_address are required"},{status:400});
    if(Number(network.chainId)!==46630) return Response.json({error:`RH_RPC_URL must target Robinhood testnet (46630), received ${network.chainId}`},{status:400});
    const routerAddress=getAddress(body.uniswap_router); const wethAddress=getAddress(body.weth_address);
    const router=new Contract(routerAddress,ROUTER_ABI,provider);
    const [uniFactory,routerWeth]=await Promise.all([router.factory(),router.WETH()]);
    if(getAddress(routerWeth)!==wethAddress) return Response.json({error:"Router WETH does not match weth_address"},{status:400});
    const wallet=new Wallet(secrets.get("KYDOS_DEPLOYER_KEY"),provider);
    const factory=await new ContractFactory(artifact.abi,artifact.bytecode,wallet).deploy(routerAddress,wethAddress);
    await factory.waitForDeployment();
    const receipt=await factory.deploymentTransaction().wait();
    const factoryAddress=(await factory.getAddress()).toLowerCase();
    const implementation=String(await factory.curveImplementation()).toLowerCase();
    const active=await db.entities.KydosConfig.filter({active:true});
    await Promise.all(active.map((row)=>db.entities.KydosConfig.update(row.id,{active:false})));
    const config=await db.entities.KydosConfig.create({chain_id:46630,protocol_version:"legacy_v2",factory_address:factoryAddress,curve_implementation:implementation,uniswap_router:routerAddress.toLowerCase(),uniswap_factory:String(uniFactory).toLowerCase(),weth_address:wethAddress.toLowerCase(),deployment_tx:receipt.hash,deployment_block:receipt.blockNumber,deployed_at:Date.now(),active:true});
    return Response.json({config,deployer:wallet.address,balance:await provider.getBalance(wallet.address).then(String)});
  } catch(error) { return Response.json({error:error.message},{status:500}); }
}