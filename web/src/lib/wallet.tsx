import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {createPublicClient,createWalletClient,custom,fallback,http,isAddress,numberToHex,type Address,type EIP1193Provider,type Hash,type WalletClient} from "viem";
import {chain} from "../chain/config";
import {tx} from "./copy";
export type WalletConnection={provider?:EIP1193Provider;address?:Address;ready:boolean;connect():Promise<void>|void};
let rpcWallet:EIP1193Provider|undefined;
const readMethods=new Set(["eth_chainId","eth_call","eth_blockNumber","eth_getLogs","eth_getBlockByNumber","eth_getBlockByHash","eth_getTransactionReceipt","eth_getTransactionByHash","eth_getBalance","eth_getCode"]);
const readOnlyWallet={request:async(args:{method:string;params?:unknown})=>{
  const provider=rpcWallet;
  if(!provider||!readMethods.has(args.method))throw new Error("Read fallback unavailable");
  const network=await provider.request({method:"eth_chainId"});
  if(Number(network)!==chain.id)throw new Error("Read fallback on another network");
  return provider.request(args as never);
}} as EIP1193Provider;
export const pub=createPublicClient({chain,transport:fallback([http(undefined,{batch:true,retryCount:1,timeout:10_000}),custom(readOnlyWallet,{retryCount:0})],{retryCount:1,retryDelay:750})});
export type Toast={id:number;kind:"wait"|"ok"|"err";text:string;hash?:Hash};
type Ctx={account?:Address;wrongChain:boolean;busy:boolean;connect():Promise<void>;send(label:string,fn:(w:WalletClient,a:Address)=>Promise<Hash>):Promise<boolean>;toasts:Toast[];tick:number};
const WalletCtx=createContext<Ctx>(null!);
export const useWallet=()=>useContext(WalletCtx);
let sequence=0;
function firstAccount(value:unknown,preferred?:Address):Address|undefined {
 if(!Array.isArray(value))return;
 const accounts=value.filter((item):item is Address=>typeof item==="string"&&isAddress(item));
 return preferred?accounts.find(item=>item.toLowerCase()===preferred.toLowerCase()):accounts[0];
}
export function WalletProvider({children,connection}:{children:ReactNode;connection:WalletConnection}) {
 const [account,setAccount]=useState<Address>();
 const [chainId,setChainId]=useState<number>();
 const [toasts,setToasts]=useState<Toast[]>([]);
 const [tick,setTick]=useState(0),[busy,setBusy]=useState(false);
 const locked=useRef(false),currentAccount=useRef<Address|undefined>(undefined),mounted=useRef(true);
 const timers=useRef(new Set<number>());
 const eth=connection.provider;
 const selectedProvider=useRef(eth);selectedProvider.current=eth;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;timers.current.forEach(clearTimeout);timers.current.clear();};},[]);
 const later=useCallback((fn:()=>void,ms:number)=>{const id=window.setTimeout(()=>{timers.current.delete(id);if(mounted.current)fn();},ms);timers.current.add(id);},[]);
 const toast=useCallback((item:Omit<Toast,"id">,id=++sequence)=>{
  if(!mounted.current)return id;
  setToasts(all=>[...all.filter(t=>t.id!==id),{...item,id}]);
  if(item.kind!=="wait")later(()=>setToasts(all=>all.filter(t=>t.id!==id)),8000);
  return id;
 },[later]);
 useEffect(()=>{
  rpcWallet=eth;
  if(!eth){currentAccount.current=undefined;setAccount(undefined);setChainId(undefined);return;}
  let stopped=false;
  const onAcc=(raw:unknown)=>{if(stopped)return;const selected=firstAccount(raw,connection.address);currentAccount.current=selected;setAccount(selected);};
  const onChain=(raw:unknown)=>{if(stopped)return;const value=Number(raw);setChainId(Number.isSafeInteger(value)?value:undefined);};
  let retryTimer:number|undefined,emptyReads=0;
  const refresh=()=>void eth.request({method:"eth_accounts"}).then(raw=>{
   if(stopped)return;
   if(firstAccount(raw,connection.address)){emptyReads=0;onAcc(raw);return;}
   if(++emptyReads<3){retryTimer=window.setTimeout(refresh,500*emptyReads);return;}
   onAcc(raw);
  }).catch(()=>{if(stopped)return;if(++emptyReads<3)retryTimer=window.setTimeout(refresh,500*emptyReads);else onAcc([]);});
  const onDisconnect=()=>{onAcc([]);onChain(undefined);emptyReads=0;retryTimer=window.setTimeout(refresh,750);};
  refresh();
  void eth.request({method:"eth_chainId"}).then(onChain).catch(()=>{});
  eth.on?.("accountsChanged",onAcc);eth.on?.("chainChanged",onChain);eth.on?.("disconnect",onDisconnect);
  const onVisible=()=>{if(!document.hidden)refresh();};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{stopped=true;if(retryTimer!==undefined)clearTimeout(retryTimer);if(rpcWallet===eth)rpcWallet=undefined;eth.removeListener?.("accountsChanged",onAcc);eth.removeListener?.("chainChanged",onChain);eth.removeListener?.("disconnect",onDisconnect);document.removeEventListener("visibilitychange",onVisible);};
 },[eth,connection.address]);
 const connect=useCallback(async()=>{
  if(locked.current){toast({kind:"err",text:tx("Transaction pending. Do not submit again.")});return;}
  try {await connection.connect();}
  catch{toast({kind:"err",text:tx("Wallet connection failed. Try again.")});}
 },[connection,toast]);
 const ensureChain=useCallback(async()=>{
  if(!eth)throw new Error("Wallet unavailable");
  try{await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:numberToHex(chain.id)}]});}
  catch(error:unknown){
   const e=error as {code?:number;data?:{originalError?:{code?:number}}};
   if(e?.code!==4902&&e?.data?.originalError?.code!==4902)throw error;
   await eth.request({method:"wallet_addEthereumChain",params:[{chainId:numberToHex(chain.id),chainName:chain.name,nativeCurrency:chain.nativeCurrency,rpcUrls:chain.rpcUrls.default.http,blockExplorerUrls:chain.blockExplorers?[chain.blockExplorers.default.url]:undefined}]});
   await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:numberToHex(chain.id)}]});
  }
  if(Number(await eth.request({method:"eth_chainId"}))!==chain.id)throw new Error("Wrong network");
  if(mounted.current)setChainId(chain.id);
 },[eth]);
 const send=useCallback<Ctx["send"]>(async(label,fn)=>{
  if(locked.current){toast({kind:"err",text:tx("Transaction pending. Do not submit again.")});return false;}
  locked.current=true;setBusy(true);
  const id=toast({kind:"wait",text:label});let hash:Hash|undefined,changedIntent=false;
  const release=()=>{locked.current=false;if(mounted.current)setBusy(false);};
  try{
   if(!eth||selectedProvider.current!==eth||!connection.ready)throw new Error("Wallet unavailable");
   const a=firstAccount(await eth.request({method:currentAccount.current?"eth_accounts":"eth_requestAccounts"}),connection.address);
   if(!a)throw new Error("Account unavailable");
   if(currentAccount.current&&a.toLowerCase()!==currentAccount.current.toLowerCase())throw new Error("Account changed");
   currentAccount.current=a;setAccount(a);
   await ensureChain();
   const latest=firstAccount(await eth.request({method:"eth_accounts"}),a);
   if(!latest||latest.toLowerCase()!==a.toLowerCase())throw new Error("Account changed");
   const guarded={request:async(args:{method:string;params?:unknown})=>{
    if(args.method==="eth_sendTransaction"||args.method==="eth_signTransaction"||args.method==="wallet_sendCalls"){
     const [accounts,network]=await Promise.all([eth.request({method:"eth_accounts"}),eth.request({method:"eth_chainId"})]);
     const active=firstAccount(accounts,a);
     if(selectedProvider.current!==eth||!active||active.toLowerCase()!==a.toLowerCase()||currentAccount.current?.toLowerCase()!==a.toLowerCase()||Number(network)!==chain.id)throw Error("Wallet changed before signing");
    }
    return eth.request(args as never);
   }} as EIP1193Provider;
   const wallet=createWalletClient({account:a,chain,transport:custom(guarded,{retryCount:0})});
   hash=await fn(wallet,a);toast({kind:"wait",text:label,hash},id);
   const receipt=await pub.waitForTransactionReceipt({hash,timeout:120_000,onReplaced:replacement=>{hash=replacement.transaction.hash;changedIntent ||= replacement.reason!=="repriced";toast({kind:"wait",text:label,hash},id);}});
   if(changedIntent){release();toast({kind:"err",text:`${label} · ${tx("Transaction cancelled or replaced. The original action is incomplete.")}`,hash},id);return false;}
   if(receipt.status!=="success"){release();toast({kind:"err",text:`${label} · ${tx("Transaction failed.")}`,hash},id);return false;}
   release();toast({kind:"ok",text:label,hash},id);if(mounted.current)setTick(t=>t+1);return true;
  }catch{
   if(hash){
    const submittedHash=hash;
    toast({kind:"wait",text:`${label} · ${tx("Awaiting on-chain confirmation. Do not submit again.")}`,hash:submittedHash},id);
    const check=async()=>{
     try {const receipt=await pub.getTransactionReceipt({hash:submittedHash});release();const success=receipt.status==="success"&&!changedIntent;toast({kind:success?"ok":"err",text:success?label:`${label} · ${tx("Action incomplete. Check the transaction record.")}`,hash:submittedHash},id);if(mounted.current)setTick(t=>t+1);}
     catch{later(()=>{void check();},20_000);}
    };
    later(()=>{void check();},20_000);
   }else{release();toast({kind:"err",text:`${label} · ${tx("Action incomplete. Check your account and network.")}`},id);}
   return false;
  }
 },[eth,connection.address,connection.ready,ensureChain,later,toast]);
 const value=useMemo<Ctx>(()=>({account,wrongChain:!!account&&chainId!==undefined&&chainId!==chain.id,busy,connect,send,toasts,tick}),[account,chainId,busy,connect,send,toasts,tick]);
 return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
