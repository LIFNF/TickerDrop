import {marketRound} from './allocation.mjs';
import {sessionSchedule} from './calendar.mjs';

// TradingView is the primary ranking source. Nasdaq corroborates every recipient,
// not the completeness of TradingView's ranking. These are operator-run checks,
// not signatures issued by either data provider.
export function validateAutomaticReport(record,tickers,fresh,corroboration,now=Date.now()){
 const {closedAt,nextOpen}=sessionSchedule(record,{},record.date);
 const captured=Date.parse(record.takenAt);
 if(record.source!=='TradingView delayed screener'||record.status!=='provisional'
    ||!Number.isFinite(captured)||captured<closedAt*1000+20*60000||captured>now+30000
    ||now<closedAt*1000+20*60000||now>=Math.min(nextOpen*1000,closedAt*1000+3.5*3600000)
    ||now-captured>3.5*3600000)throw Error('Quote capture outside the verified closing window');
 if(record.matched!==tickers.length||fresh.total!==tickers.length)throw Error('Primary ranking does not cover the collection universe');
 const {picked}=marketRound(record,tickers);
 const cutoff=picked.at(-1)?.g??0;
 const selected=new Set(picked.map(p=>p.id));
 if(!Array.isArray(fresh.secondaryRanking))throw Error('Secondary ranking check is missing');
 for(const challenger of fresh.secondaryRanking){
  if(!selected.has(challenger.id)&&challenger.g>cutoff+200)throw Error('Secondary source identifies an omitted higher gainer');
 }
 if(fresh.progress.needsMore||fresh.progress.ranked.length!==picked.length
    ||fresh.progress.rankingExhausted!==record.rankingExhausted)throw Error('Ranking changed; refusing to sign');
 for(let i=0;i<picked.length;i++){
  const p=picked[i],q=fresh.progress.ranked[i];
  if(p.id!==q.id||p.g!==q.g)throw Error('Fresh ranking differs from recorded allocation');
  const primary=fresh.rows.find(row=>row.id===p.id),old=record.prices?.find(row=>row.id===p.id);
  const secondary=corroboration.get(p.id);
  if(!primary||!old||old.s!==tickers[p.id-1].s||!Number.isFinite(old.price)||old.price<=0
     ||Math.abs(primary.price-old.price)/old.price>0.001)throw Error('Recorded closing price differs from fresh source');
  if(!secondary||secondary.date!==record.date||secondary.symbol!==primary.s||secondary.venue!=='NASDAQ'
     ||!Number.isFinite(secondary.price)||secondary.price<=0||!Number.isFinite(secondary.change)
     ||Math.abs(secondary.price-primary.price)/primary.price>0.001
     ||Math.abs(secondary.change-primary.change)>0.02)throw Error('Secondary closing quote is missing, stale or inconsistent');
 }
 return {picked,closedAt,nextOpen};
}
