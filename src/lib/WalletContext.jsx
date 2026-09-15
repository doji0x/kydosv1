import React,{createContext,useContext,useEffect,useMemo,useState} from "react";
import { BrowserProvider } from "ethers";
import { RH_CHAINS, RH_TESTNET } from "@/lib/kydosContracts";

const WalletContext=createContext(null);
export function WalletProvider({children}){
  const [address,setAddress]=useState(""); const [chainId,setChainId]=useState(0);
  const ethereum=window.ethereum;
  const refresh=async()=>{ if(!ethereum) return; const [accounts,chain]=await Promise.all([ethereum.request({method:"eth_accounts"}),ethereum.request({method:"eth_chainId"})]); setAddress(accounts[0]||""); setChainId(Number(chain)); };
  useEffect(()=>{ if(!ethereum)return; const onAccountsChanged=(accounts)=>setAddress(accounts[0]||""); const onChainChanged=(chain)=>setChainId(Number(chain)); ethereum.on("accountsChanged",onAccountsChanged); ethereum.on("chainChanged",onChainChanged); return()=>{ethereum.removeListener("accountsChanged",onAccountsChanged);ethereum.removeListener("chainChanged",onChainChanged);};},[]);
  const ensureChain=async(targetId=RH_TESTNET.chainId)=>{ const chain=RH_CHAINS[targetId]; if(!ethereum) throw new Error("Install a browser wallet to continue"); if(!chain) throw new Error("Unsupported Robinhood network"); try{await ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:chain.hexChainId}]});}catch(e){if(e.code!==4902)throw e;await ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:chain.hexChainId,chainName:chain.name,nativeCurrency:chain.currency,rpcUrls:[chain.rpc],blockExplorerUrls:[chain.explorer]}]});} await refresh();};
  const connect=async()=>{if(!ethereum)throw new Error("Install a browser wallet to continue");await ethereum.request({method:"eth_requestAccounts"});await ensureChain();await refresh();return (await new BrowserProvider(ethereum).getSigner()).getAddress();};
  const signer=async(targetId=RH_TESTNET.chainId)=>{await ensureChain(targetId);return new BrowserProvider(ethereum).getSigner();};
  const value=useMemo(()=>({address,chainId,connected:!!address,isTestnet:chainId===RH_TESTNET.chainId,connect,signer}),[address,chainId]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
export const useWallet=()=>useContext(WalletContext);