import {useEffect,useState} from "react";
import type {Address,Hex} from "viem";
import {addr,dropAbi,explorer,live,poolAbi,tickrAbi} from "../chain/config";
import {pub,useWallet} from "../lib/wallet";
import {eth,short,tkn} from "../lib/format";
import {tx} from "../lib/copy";

type Item={kind:"mint"|"list"|"unlist"|"sale"|"eth"|"tickr";actor?:Address;value:bigint;id?:number;count?:number;block:bigint;index:number;hash:Hex};

async function recent(kind:"market"|"pool",blocks:bigint):Promise<Item[]>{
 const latest=await pub.getBlockNumber();
 const fromBlock=latest>blocks?latest-blocks:0n;
 const range={fromBlock,toBlock:latest} as const;
 if(kind==="market"){
  const [mints,lists,unlists,sales]=await Promise.all([
   pub.getContractEvents({address:addr.drop,abi:dropAbi,eventName:"Minted",...range}),
   pub.getContractEvents({address:addr.drop,abi:dropAbi,eventName:"Listed",...range}),
   pub.getContractEvents({address:addr.drop,abi:dropAbi,eventName:"Unlisted",...range}),
   pub.getContractEvents({address:addr.drop,abi:dropAbi,eventName:"Sold",...range}),
  ]);
  return [
   ...mints.map(x=>({kind:"mint" as const,actor:x.args.to!,value:x.args.paid!,count:Number(x.args.count),block:x.blockNumber,index:x.logIndex,hash:x.transactionHash})),
   ...lists.map(x=>({kind:"list" as const,actor:x.args.seller!,value:x.args.price!,id:Number(x.args.id),block:x.blockNumber,index:x.logIndex,hash:x.transactionHash})),
   ...unlists.map(x=>({kind:"unlist" as const,value:0n,id:Number(x.args.id),block:x.blockNumber,index:x.logIndex,hash:x.transactionHash})),
   ...sales.map(x=>({kind:"sale" as const,actor:x.args.buyer!,value:x.args.price!,id:Number(x.args.id),block:x.blockNumber,index:x.logIndex,hash:x.transactionHash})),
  ].sort((a,b)=>a.block===b.block?b.index-a.index:a.block>b.block?-1:1).slice(0,12);
 }
 const [ethIn,tickrIn]=await Promise.all([
  pub.getContractEvents({address:addr.pool,abi:poolAbi,eventName:"ETHFunded",...range}),
  pub.getContractEvents({address:addr.tickr,abi:tickrAbi,eventName:"Transfer",args:{to:addr.pool},...range}),
 ]);
 return [
  ...ethIn.map(x=>({kind:"eth" as const,actor:x.args.source!,value:x.args.amount!,block:x.blockNumber,index:x.logIndex,hash:x.transactionHash})),
  ...tickrIn.map(x=>({kind:"tickr" as const,actor:x.args.from!,value:x.args.value!,block:x.blockNumber,index:x.logIndex,hash:x.transactionHash})),
 ].sort((a,b)=>a.block===b.block?b.index-a.index:a.block>b.block?-1:1).slice(0,12);
}

export function ChainActivity({kind}:{kind:"market"|"pool"}){
 const {tick}=useWallet();
 const [items,setItems]=useState<Item[]>([]);
 const [error,setError]=useState(false);
 const [loading,setLoading]=useState(true);
 const [windowSize,setWindowSize]=useState(2048);
 useEffect(()=>{
  if(!live)return;
  let stopped=false,busy=false;
  const load=async()=>{
   if(busy)return;busy=true;
   try {
    for(const blocks of [2048,512,128]){
     try {const value=await recent(kind,BigInt(blocks));if(!stopped){setItems(value);setWindowSize(blocks);setError(false);}return;}
     catch { /* Try a shorter complete block window on RPC range limits. */ }
    }
    if(!stopped)setError(true);
   } finally {busy=false;if(!stopped)setLoading(false);}
  };
  load();const timer=window.setInterval(load,30_000);
  return()=>{stopped=true;clearInterval(timer);};
 },[kind,tick]);
 const label=(x:Item)=>x.kind==="mint"?`${tx("Minted")} ×${x.count}`:x.kind==="list"?`${tx("Listed")} #${x.id}`:x.kind==="unlist"?`${tx("Unlisted")} #${x.id}`:x.kind==="sale"?`${tx("Sold")} #${x.id}`:x.kind==="eth"?tx("ETH received"):tx("TICKR received");
 return <div className="panel chain-activity">
  <h3>{tx(kind==="market"?"Recent on-chain market activity":"Recent on-chain pool inflows")}</h3>
  <small>{tx("Latest {count} blocks · confirmed chain events",{count:windowSize.toLocaleString()})}</small>
  {error?<p role="status">{tx("Recent activity unavailable. Current balances remain on-chain.")}</p>:loading?<p>{tx("Loading chain activity…")}</p>:items.length===0?<p>{tx("No recent activity")}</p>:
   <div className="scroll"><table><tbody>{items.map(x=><tr key={`${x.hash}-${x.index}`}>
    <td>{label(x)}</td><td>{x.kind==="tickr"?`${tkn(x.value)} TICKR`:x.value?`${eth(x.value,5)} ETH`:"—"}</td>
    <td>{x.actor?short(x.actor):"—"}</td><td>{explorer?<a href={`${explorer}/tx/${x.hash}`} target="_blank" rel="noreferrer">{tx("View transaction")}</a>:short(x.hash)}</td>
   </tr>)}</tbody></table></div>}
 </div>;
}
