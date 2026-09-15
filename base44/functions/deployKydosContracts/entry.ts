import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } from "npm:ethers@6.15.0";
import solc from "npm:solc@0.8.13";
import { compileFactory } from "../../shared/kydosContracts.js";

const ROUTER_ABI=["function factory() view returns(address)","function WETH() view returns(address)"];
export default async function(req: Request): Promise<Response> {
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user) return Response.json({error:"Unauthorized"},{status:401});
    if(user.role!=="admin") return Response.json({error:"Forbidden"},{status:403});
    const body=await req.json().catch(()=>({}));
    if(!body.uniswap_router || !body.weth_address) return Response.json({error:"uniswap_router and weth_address are required"},{status:400});
    const rpcUrl=secrets.get("RH_RPC_URL");
    const key=secrets.get("KYDOS_DEPLOYER_KEY");
    const provider=new JsonRpcProvider(rpcUrl);
    const network=await provider.getNetwork();
    if(Number(network.chainId)!==46630) return Response.json({error:`RH_RPC_URL must target Robinhood testnet (46630), received ${network.chainId}`},{status:400});
    const routerAddress=getAddress(body.uniswap_router); const wethAddress=getAddress(body.weth_address);
    const router=new Contract(routerAddress,ROUTER_ABI,provider);
    const [uniFactory,routerWeth]=await Promise.all([router.factory(),router.WETH()]);
    if(getAddress(routerWeth)!==wethAddress) return Response.json({error:"Router WETH does not match weth_address"},{status:400});
    const artifact=compileFactory(solc);
    const wallet=new Wallet(key,provider);
    const factory=await new ContractFactory(artifact.abi,`0x${artifact.evm.bytecode.object}`,wallet).deploy(routerAddress,wethAddress);
    await factory.waitForDeployment();
    const receipt=await factory.deploymentTransaction().wait();
    const factoryAddress=(await factory.getAddress()).toLowerCase();
    const implementation=String(await factory.curveImplementation()).toLowerCase();
    const db=base44.asServiceRole;
    const active=await db.entities.KydosConfig.filter({active:true});
    await Promise.all(active.map((row)=>db.entities.KydosConfig.update(row.id,{active:false})));
    const config=await db.entities.KydosConfig.create({chain_id:46630,factory_address:factoryAddress,curve_implementation:implementation,uniswap_router:routerAddress.toLowerCase(),uniswap_factory:String(uniFactory).toLowerCase(),weth_address:wethAddress.toLowerCase(),deployment_tx:receipt.hash,deployment_block:receipt.blockNumber,deployed_at:Date.now(),active:true});
    return Response.json({config,deployer:wallet.address,balance:await provider.getBalance(wallet.address).then(String)});
  } catch(error) { return Response.json({error:error.message},{status:500}); }
}