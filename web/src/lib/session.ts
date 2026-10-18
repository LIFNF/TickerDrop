import { useEffect, useState } from "react";
import {jsonResource,sessionRows} from "./reliable";
import {numberLocale} from "./locale";
import {encodeAbiParameters,keccak256,parseAbi} from "viem";
import {addr,chain} from "../chain/config";
import {pub} from "./wallet";
import {markData} from "./reliable";

// gains are in contract units: 1e6 = 100%, null = no print that day
export type Session = { date: string; gains: (number | null)[];allocationOnly?:boolean };

export type Pick = { id: number; gain: number; weight: number; share: number };

export type Board = {
  allocationOnly?:boolean;
  date: string;
  picks: Pick[];
  green: number;
  red: number;
  sum: number; // Σ weight, 1e6 = 100%
};

export const FULL = 1_000_000;

const oracleAbi=parseAbi(["function session(uint32 day) view returns(bytes32,uint64,uint64,uint64)","function lastPublishedDay() view returns(uint32)"]);
const loadSessions=jsonResource("sessions",["https://raw.githubusercontent.com/LIFNF/TickerDrop/main/data/verified-sessions.json",`${import.meta.env.BASE_URL}sessions.json`,`${import.meta.env.BASE_URL}backup/sessions.json`],sessionRows);
async function verifiedSessions(){
 const rows=await loadSessions();
 const last=await pub.readContract({address:addr.marketOracle,abi:oracleAbi,functionName:"lastPublishedDay"});
 if(!last)return [];
 const latest=rows.find(s=>Date.parse(s.date+"T00:00:00Z")/86400000===last);
 if(!latest)throw Error("Latest signed report is not available");
 const board=boardOf(latest);
 const [commitment,,,nextOpen]=await pub.readContract({address:addr.marketOracle,abi:oracleAbi,functionName:"session",args:[last]});
 const digest=keccak256(encodeAbiParameters([{type:"uint256"},{type:"address"},{type:"uint32"},{type:"uint16[]"},{type:"uint32[]"}],[BigInt(chain.id),addr.pool,last,board.picks.map(p=>p.id),board.picks.map(p=>p.gain)]));
 if(commitment!==digest||!nextOpen||Number(nextOpen)*1000>Date.now())throw Error("Unverified market report");
 return [latest];
}
export function useSessions() {
  const [list,setList]=useState<Session[]>([]);
  useEffect(()=>{
    let stopped=false;
    const load=()=>verifiedSessions().then(v=>{if(!stopped){setList(v);markData("sessions","ok");}}).catch(()=>{if(!stopped){setList([]);markData("sessions","error");}});
    void load(); const timer=setInterval(load,60_000);
    return ()=>{stopped=true;clearInterval(timer);};
  },[]);
  return list;
}
// same walk as GainPool.settle: gain desc, id asc, stop at 100%
export function boardOf(s: Session): Board {
  const order: number[] = [];
  let red = 0;
  s.gains.forEach((g, i) => {
    if (g === null) return;
    if (g > 0) order.push(i);
    else red++;
  });
  order.sort((a, b) => s.gains[b]! - s.gains[a]! || a - b);

  const picks: Pick[] = [];
  let sum = 0;
  for (const i of order) {
    if (sum >= FULL) break;
    const g = s.gains[i]!;
    const w = Math.min(g, FULL - sum);
    sum += w;
    picks.push({ id: i + 1, gain: g, weight: w, share: 0 });
  }
  picks.forEach((p) => (p.share = p.weight / sum));
  return { date: s.date, picks, green: order.length, red, sum,allocationOnly:s.allocationOnly };
}

export const gainPct = (units: number, dp = 2) => `${units > 0 ? "+" : ""}${(units / 1e4).toLocaleString(numberLocale(),{minimumFractionDigits:dp,maximumFractionDigits:dp})}%`;
