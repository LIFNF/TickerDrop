import {useEffect,useState} from 'react';
import {jsonResource} from './reliable';
export type ReferenceQuotes={source:'TradingView';status:'reference';capturedAt:string;universe:number;covered:number;rows:{id:number;s:string;price:number;change:number;mode:string}[]};
function validate(raw:unknown):ReferenceQuotes{
 const r=raw as ReferenceQuotes;
 if(!r||r.source!=='TradingView'||r.status!=='reference'||r.universe!==3172||!Array.isArray(r.rows)||r.rows.length>3172||r.covered!==r.rows.length||!Number.isFinite(Date.parse(r.capturedAt))||Date.parse(r.capturedAt)>Date.now()+300000)throw Error('Invalid reference quotes');
 const seen=new Set<number>();for(const x of r.rows){if(!Number.isInteger(x.id)||x.id<1||x.id>3172||seen.has(x.id)||!/^[A-Z0-9.-]{1,5}$/.test(x.s)||!Number.isFinite(x.price)||x.price<=0||!Number.isFinite(x.change)||x.change < -100||typeof x.mode!=='string')throw Error('Invalid reference quote');seen.add(x.id);}
 return r;
}
const load=jsonResource('reference-quotes',['https://raw.githubusercontent.com/LIFNF/TickerDrop/main/data/reference-quotes.json',`${import.meta.env.BASE_URL}reference-quotes.json`],validate);
export function useReferenceQuotes(){
 const [value,setValue]=useState<ReferenceQuotes>();
 useEffect(()=>{let stopped=false;const run=()=>load().then(v=>{if(!stopped)setValue(v);}).catch(()=>{});void run();const timer=setInterval(run,60000);return()=>{stopped=true;clearInterval(timer);};},[]);
 return value;
}
