import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
import {hexToString,stringToHex,type Hex} from "viem";
import {addr,chain,dropAbi,live} from "../chain/config";
import {pub,useWallet} from "./wallet";
import {tx} from "./copy";

const ZERO="0x0000000000";
const pattern=/^[A-Z0-9]{5}$/;
const decode=(value:Hex)=>value===ZERO?"":hexToString(value);
const storage=(key:string):Record<string,unknown>=>{try{const data=JSON.parse(localStorage.getItem(key)||"{}");return data&&typeof data==="object"&&!Array.isArray(data)?data:{};}catch{return {};}};
function save(key:string,values:Record<string,unknown>){try{localStorage.setItem(key,JSON.stringify({...storage(key),...values}));return true;}catch{return false;}}
type Info={key:string;own:string;registered:boolean;uses:number;redeemed:string;loaded:boolean;seeds:number;earned:bigint;reserve:bigint;error:string};
type InviteContext={own:string;registered:boolean;uses:number;seeds:number;earned:bigint;input:string;valid:boolean;message:string;setInput(value:string):void;mint(ids:bigint[],value:bigint,label:string):Promise<boolean>};
const Context=createContext<InviteContext>(null!);
export const useInvites=()=>useContext(Context);

export function InviteProvider({children}:{children:ReactNode}){
 const {account,send,tick,busy}=useWallet();
 const key=account?`tickerdrop:invites:v1:${chain.id}:${addr.drop.toLowerCase()}:${account.toLowerCase()}`:"";
 const [info,setInfo]=useState<Info>({key:"",own:"",registered:false,uses:0,redeemed:"",loaded:false,seeds:0,earned:0n,reserve:0n,error:""});
 const [draft,setDraft]=useState({key:"",value:""});
 const [check,setCheck]=useState({key:"",input:"",valid:false,message:""});
 const [refresh,setRefresh]=useState(0);
 const current=info.key===key?info:undefined;
 const input=draft.key===key?draft.value:"";

 useEffect(()=>{
  if(!account||!live)return;
  let cancelled=false,reading=false;
  const read=async()=>{
   if(reading)return;reading=true;
   try{
    const [own,redeemed,seeds,earned,reserve]=await Promise.all([
     pub.readContract({address:addr.drop,abi:dropAbi,functionName:"inviteOf",args:[account]}),
     pub.readContract({address:addr.drop,abi:dropAbi,functionName:"redeemedInvite",args:[account]}),
     pub.readContract({address:addr.drop,abi:dropAbi,functionName:"seedCount"}),
     pub.readContract({address:addr.drop,abi:dropAbi,functionName:"referralEarned",args:[account]}),
     pub.readContract({address:addr.drop,abi:dropAbi,functionName:"referralReserve"})]);
    const registered=own!==ZERO;
    const uses=registered?await pub.readContract({address:addr.drop,abi:dropAbi,functionName:"inviteUses",args:[own]}):0;
    if(cancelled)return;
    const ownText=decode(own),redeemedText=decode(redeemed);
    setInfo({key,own:ownText,registered,uses,redeemed:redeemedText,loaded:true,seeds:Number(seeds),earned,reserve,error:""});
    const cached=storage(key);
    setDraft(old=>({key,value:redeemedText||(old.key===key?old.value:typeof cached.input==="string"&&pattern.test(cached.input)?cached.input:"")}));
    save(key,{own:ownText,registered,redeemed:redeemedText});
   }catch{if(!cancelled)setInfo(old=>({...(old.key===key?old:{own:"",registered:false,uses:0,redeemed:"",seeds:0,earned:0n,reserve:0n}),key,loaded:false,error:"Invitation data unavailable. Minting is paused."}));}
   finally{reading=false;}
  };
  void read();const timer=window.setInterval(()=>{void read();},15000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[account,key,tick,refresh]);

 const setInput=useCallback((value:string)=>{
  const normalized=value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5);
  setDraft({key,value:normalized});if(key)save(key,{input:normalized});
 },[key]);

 useEffect(()=>{
  if(!account||!live||!current?.loaded||!pattern.test(input))return;
  let cancelled=false;
  const timer=window.setTimeout(()=>{void(async()=>{
   try{
    const code=stringToHex(input,{size:5});
    const [owner,uses]=await Promise.all([
     pub.readContract({address:addr.drop,abi:dropAbi,functionName:"inviteOwner",args:[code]}),
     pub.readContract({address:addr.drop,abi:dropAbi,functionName:"inviteUses",args:[code]})]);
    let message="Invitation code valid";
    if(/^0x0{40}$/i.test(owner))message="Code not found or not yet confirmed on-chain";
    else if(owner.toLowerCase()===account.toLowerCase())message="You cannot use your own code";
    else if(current.redeemed&&current.redeemed!==input)message="Use your linked invitation code";
    else if(!current.redeemed&&uses>=3)message="This code has no places remaining";
    if(!cancelled)setCheck({key,input,valid:message==="Invitation code valid",message});
   }catch{if(!cancelled)setCheck({key,input,valid:false,message:"Code verification unavailable. Try again later."});}
  })();},300);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[account,key,input,current,tick,refresh]);
 const direct=!!current?.loaded&&!current.redeemed&&(!!current.own||current.seeds<50);
 const valid=!!account&&!!current?.loaded&&(direct||!!current.redeemed||check.key===key&&check.input===input&&check.valid);
 const message=!live?"Available after contract deployment":!account?"Connect your wallet to check eligibility":current?.error||(direct?"The first 50 successful minting wallets need no code":current?.redeemed?"Your linked invitation applies automatically":!pattern.test(input)?"Enter 5 letters or digits":check.key===key&&check.input===input?check.message:"Verifying…");
 const mint=async(ids:bigint[],value:bigint,label:string)=>{
  if(!valid||!account||busy)return false;
  const wallet=account,code=direct||current?.redeemed?ZERO as Hex:input?stringToHex(input,{size:5}):ZERO as Hex;
  const ok=await send(label,async(w,a)=>{
   if(a.toLowerCase()!==wallet.toLowerCase())throw Error("Account changed");
   await pub.simulateContract({account:a,address:addr.drop,abi:dropAbi,functionName:"mint",args:[ids,code],value});
   return w.writeContract({account:a,chain:w.chain,address:addr.drop,abi:dropAbi,functionName:"mint",args:[ids,code],value});
  });
  if(ok)setRefresh(x=>x+1);
  return ok;
 };
 return <Context.Provider value={{own:current?.own||"",registered:!!current?.registered,uses:current?.uses||0,seeds:current?.seeds||0,earned:current?.earned||0n,input,valid,message:tx(message),setInput,mint}}>{children}</Context.Provider>;
}
