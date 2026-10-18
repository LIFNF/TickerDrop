import {buildRound,FULL} from './round.mjs';
import {validateQuoteSession} from './calendar.mjs';
export function marketRound(record,tickers){
 if(!Array.isArray(record.ranked)){validateQuoteSession(record,tickers);return buildRound(record.gains,tickers);}
 const seen=new Set(),picked=[];let weight=0,previous;
 for(const p of record.ranked){
  if(!Number.isInteger(p.id)||p.id<1||p.id>tickers.length||seen.has(p.id)||!Number.isSafeInteger(p.g)||p.g<=0||p.g>0xffffffff||weight>=FULL)throw Error('Invalid ranked allocation');
  if(previous&&(p.g>previous.g||p.g===previous.g&&p.id<=previous.id))throw Error('Ranked allocations must be ordered by gain then NFT ID');
  seen.add(p.id);picked.push({id:p.id,s:tickers[p.id-1].s,g:p.g});weight+=Math.min(p.g,FULL-weight);previous=p;
 }
 if(weight<FULL&&record.rankingExhausted!==true)throw Error('Ranking ended before the cap without exhausting gainers');
 return {picked,positive:picked.length,weight};
}
export function validateMarketRecord(record,tickers){marketRound(record,tickers);}
