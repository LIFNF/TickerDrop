import {mkdirSync,writeFileSync,renameSync,existsSync,appendFileSync,readdirSync} from 'node:fs';
import {captureTradingView} from './tradingview.mjs';
import {nasdaq,nyNow,isoOf,tickers,isLive,root} from './lib.mjs';
import {sessionSchedule} from './calendar.mjs';
import {safeError} from './safe-error.mjs';

function output(ready,date=''){
 console.log(ready?'Closing candidate ready for automatic review.':'No eligible close to capture.');
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`ready=${ready}\ndate=${date}\n`);
}
async function main(){
 if(!isLive()){console.log('V2 deployment pending; automation is not yet operational.');return output(false);}
 const now=nyNow(),info=await nasdaq('market-info');
 if(!info.isBusinessDay||info.closeRaw?.slice(0,10)!==now.date)return output(false);
 const close=Number(info.closeRaw.slice(11,13))*60+Number(info.closeRaw.slice(14,16));
 if(now.minutes<close+20||now.minutes>=close+210)return output(false);
 const final=new URL('data/attestations/'+now.date+'.json',root);
 if(existsSync(final))return output(false);
 const signedDir=new URL('data/attestations/'+now.date+'/',root);
 if(existsSync(signedDir)&&readdirSync(signedDir).some(name=>/^0x[a-fA-F0-9]{40}\.json$/.test(name)))return output(true,now.date);
 const {rows,progress,total}=await captureTradingView(tickers);
 if(total!==tickers.length)throw Error('Collection coverage is incomplete');
 const record={date:now.date,open:info.openRaw,close:info.closeRaw,nextOpen:isoOf(info.nextTradeDate)+'T09:30:00',takenAt:new Date().toISOString(),source:'TradingView delayed screener',status:'provisional',ranked:progress.ranked,rankingExhausted:progress.rankingExhausted,prices:progress.ranked.map(p=>rows.find(q=>q.id===p.id)),matched:total};
 sessionSchedule(record,{},record.date);
 const dir=new URL('data/candidates/',root);mkdirSync(dir,{recursive:true});
 const target=new URL(now.date+'.json',dir),temporary=new URL(now.date+'.'+process.pid+'.tmp',dir);
 writeFileSync(temporary,JSON.stringify(record)+'\n',{flag:'wx'});renameSync(temporary,target);
 output(true,now.date);
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
