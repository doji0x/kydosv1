import React,{createContext,useContext,useEffect,useMemo,useState} from "react";
import { BrowserProvider } from "ethers";
import { RH_TESTNET } from "@/lib/kydosContracts";

const WalletContext=createContext(null);
export function WalletProvider({children}){
  const [address,setAddress]=useState(""); const [chainId,setChainId]=useState(0);
  const ethereum=window.ethereum;
  const refresh=async()=>{ if(!ethereum) return; const [accounts,chain]=await Promise.all([ethereum.request({method:"eth_accounts"}),ethereum.request({method:"eth_chainId"})]); setAddress(accounts[0]||""); setChainId(Number(chain)); };
  useEffect(()=>{ if(!ethereum)return; const onAccountsChanged=(accounts)=>setAddress(accounts[0]||""); const onChainChanged=(chain)=>setChainId(Number(chain)); ethereum.on("accountsChanged",onAccountsChanged); ethereum.on("chainChanged",onChainChanged); return()=>{ethereum.removeListener("accountsChanged",onAccountsChanged);ethereum.removeListener("chainChanged",onChainChanged);};},[]);
  const ensureTestnet=async()=>{ if(!ethereum) throw new Error("Install a browser wallet to continue"); try{await ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:RH_TESTNET.hexChainId}]});}catch(e){if(e.code!==4902)throw e;await ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:RH_TESTNET.hexChainId,chainName:RH_TESTNET.name,nativeCurrency:RH_TESTNET.currency,rpcUrls:[RH_TESTNET.rpc],blockExplorerUrls:[RH_TESTNET.explorer]}]});} await refresh();};
  const connect=async()=>{if(!ethereum)throw new Error("Install a browser wallet to continue");await ethereum.request({method:"eth_requestAccounts"});await ensureTestnet();await refresh();return (await new BrowserProvider(ethereum).getSigner()).getAddress();};
  const signer=async()=>{await ensureTestnet();return new BrowserProvider(ethereum).getSigner();};
  const value=useMemo(()=>({address,chainId,connected:!!address,isTestnet:chainId===RH_TESTNET.chainId,connect,signer}),[address,chainId]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
export const useWallet=()=>useContext(WalletContext);