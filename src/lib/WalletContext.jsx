import React,{createContext,useContext,useEffect,useMemo,useState} from "react";
import { BrowserProvider } from "ethers";
import { RH_CHAINS, RH_TESTNET } from "@/lib/kydosContracts";

const unavailable=async()=>{throw new Error("Wallet connection is not available yet");};
const WalletContext=createContext({address:"",chainId:0,connected:false,isTestnet:false,connect:unavailable,signer:unavailable});
const isMetaMask=(provider)=>provider?.isMetaMask && !provider?.isCoinbaseWallet;

async function findMetaMask(){
  const announced=[];
  const listener=(event)=>{if(event.detail?.info?.rdns==="io.metamask") announced.push(event.detail.provider);};
  window.addEventListener("eip6963:announceProvider",listener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve)=>setTimeout(resolve,150));
  window.removeEventListener("eip6963:announceProvider",listener);
  if(announced[0]) return announced[0];
  const injected=window.ethereum;
  const listed=injected?.providers?.find(isMetaMask);
  if(listed) return listed;
  return isMetaMask(injected)?injected:null;
}

export function WalletProvider({children}){
  const [address,setAddress]=useState(""); const [chainId,setChainId]=useState(0); const [provider,setProvider]=useState(null);
  const refresh=async(source=provider)=>{if(!source)return;const [accounts,chain]=await Promise.all([source.request({method:"eth_accounts"}),source.request({method:"eth_chainId"})]);setAddress(accounts[0]||"");setChainId(Number(chain));};
  useEffect(()=>{if(!provider)return;const onAccountsChanged=(accounts)=>setAddress(accounts[0]||"");const onChainChanged=(chain)=>setChainId(Number(chain));provider.on("accountsChanged",onAccountsChanged);provider.on("chainChanged",onChainChanged);return()=>{provider.removeListener("accountsChanged",onAccountsChanged);provider.removeListener("chainChanged",onChainChanged);};},[provider]);
  const ensureChain=async(targetId=RH_TESTNET.chainId,source=provider)=>{const selected=source||await findMetaMask();const chain=RH_CHAINS[targetId];if(!selected)throw new Error("Install or enable MetaMask to continue");if(!chain)throw new Error("Unsupported Robinhood network");try{await selected.request({method:"wallet_switchEthereumChain",params:[{chainId:chain.hexChainId}]});}catch(e){if(e.code!==4902)throw e;await selected.request({method:"wallet_addEthereumChain",params:[{chainId:chain.hexChainId,chainName:chain.name,nativeCurrency:chain.currency,rpcUrls:[chain.rpc],blockExplorerUrls:[chain.explorer]}]});}await refresh(selected);return selected;};
  const connect=async()=>{const selected=await findMetaMask();if(!selected)throw new Error("Install or enable MetaMask to continue");setProvider(selected);await selected.request({method:"eth_requestAccounts"});await ensureChain(RH_TESTNET.chainId,selected);await refresh(selected);return (await new BrowserProvider(selected).getSigner()).getAddress();};
  const signer=async(targetId=RH_TESTNET.chainId)=>{const selected=await ensureChain(targetId);return new BrowserProvider(selected).getSigner();};
  const value=useMemo(()=>({address,chainId,connected:!!address,isTestnet:chainId===RH_TESTNET.chainId,connect,signer}),[address,chainId,provider]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
export const useWallet=()=>useContext(WalletContext);