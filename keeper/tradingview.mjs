// Delayed TradingView reference ranking; never a substitute for oracle authorization.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {safeError} from './safe-error.mjs';
import {parseTradingView,rankProgress} from './tradingview-parser.mjs';
import {nasdaq,nyNow,isoOf} from './lib.mjs';
import {writeSnapshot,readSnapshot} from './storage.mjs';
import {referenceExpiry} from './reference-age.mjs';
export async function captureTradingView(tickers){
 const rows=[],seen=new Set();let progress,total=0;
 for(let offset=0;offset<6400;offset+=100){
  const response=await fetch('https://scanner.tradingview.com/america/scan',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({symbols:{tickers:tickers.map(t=>'NASDAQ:'+t.s)},sort:{sortBy:'change',sortOrder:'desc'},columns:['name','exchange','close','change','change_abs','update_mode','type','currency'],range:[offset,offset+100]}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('TradingView reference ranking unavailable');
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>2000000)throw Error('Oversized quote response');chunks.push(chunk);}
  const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!Number.isInteger(raw.totalCount)||raw.totalCount<0||raw.totalCount>tickers.length)throw Error('Invalid ranking size');
  if(offset&&raw.totalCount!==total)throw Error('Ranking universe changed during pagination');
  total=raw.totalCount;
  const page=parseTradingView(raw,tickers);
  if(page.length!==raw.data.length)throw Error('Invalid or unmapped quote in ranking; refusing to skip a possible winner');
  if(!page.length&&offset<total)throw Error('Incomplete ranking response');
  // Parser maps IDs; retain provider ranking order for boundary detection.
  const byId=new Map(page.map(q=>[q.s,q]));
  const ordered=raw.data.map(x=>byId.get(x.d[0]));
  for(const q of ordered){if(seen.has(q.id))throw Error('Ranking changed across pages; retry capture');if(rows.length&&q.change>rows.at(-1).change)throw Error('Ranking is not descending');seen.add(q.id);rows.push(q);}
  progress=rankProgress(rows,offset+raw.data.length>=total);
  if(!progress.needsMore)break;
 }
 if(!rows.length||progress?.needsMore)throw Error('Ranking could not be completed safely');
 return {rows,progress,total};
}
async function main(){
 const tickers=JSON.parse(readFileSync(new URL('../data/tickers.json',import.meta.url),'utf8'));
 const {rows,progress,total}=await captureTradingView(tickers);
 const capturedAt=new Date().toISOString();
 const record={source:'TradingView',status:'reference',capturedAt,universe:tickers.length,covered:rows.length,matched:total,ranked:progress.ranked,rankingExhausted:progress.rankingExhausted,rows};
 try{record.validUntil=referenceExpiry(await nasdaq('market-info'),capturedAt);}catch{/* Calendar unavailable: frontend applies the conservative age limit. */}
 for(const rel of ['../data/reference-quotes.json','../web/public/reference-quotes.json']){
  const file=fileURLToPath(new URL(rel,import.meta.url));mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(record)+'\n');
 }
 console.log('TradingView: read '+rows.length+' prices from '+total+' matching listings; '+progress.ranked.length+' selected; weight '+progress.weight+'/1000000. Delayed reference data.');
 if(process.argv.includes('--session')){
  const now=nyNow(),info=await nasdaq('market-info');
  if(!info.isBusinessDay||info.closeRaw?.slice(0,10)!==now.date){console.log('No new regular-market session today');return;}
  const closeMinutes=Number(info.closeRaw.slice(11,13))*60+Number(info.closeRaw.slice(14,16));
  if(now.minutes<closeMinutes+20||now.minutes>19*60+30)throw Error('Capture must follow the close and quote delay, before the late-evening cutoff');
  const file=new URL('../data/sessions/'+now.date+'.json',import.meta.url);
  if(existsSync(file)){readSnapshot(file,now.date,tickers);console.log('Existing session preserved; latest quotes remain reference only');return;}
  mkdirSync(new URL('../data/sessions/',import.meta.url),{recursive:true});
  writeSnapshot(file,{date:now.date,open:info.openRaw,close:info.closeRaw,nextOpen:isoOf(info.nextTradeDate)+'T09:30:00',takenAt:capturedAt,source:'TradingView delayed screener',status:'provisional',ranked:progress.ranked,rankingExhausted:progress.rankingExhausted,prices:progress.ranked.map(p=>rows.find(q=>q.id===p.id)),matched:total},tickers);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
