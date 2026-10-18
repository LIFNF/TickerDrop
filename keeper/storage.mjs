import {readFileSync,writeFileSync,linkSync,unlinkSync} from 'node:fs';
import {validateQuoteSession,sessionSchedule} from './calendar.mjs';
import {validateMarketRecord} from './allocation.mjs';

export function readSnapshot(file,date,tickers){
 const record=JSON.parse(readFileSync(file,'utf8'));
 if(record.date!==date)throw Error('Snapshot date mismatch');
 validateMarketRecord(record,tickers);sessionSchedule(record,{},date);
 return record;
}
export function writeSnapshot(file,record,tickers){
 validateMarketRecord(record,tickers);sessionSchedule(record,{},record.date);
 const temporary=new URL(file.href+'.'+process.pid+'.tmp');
 let created=false;
 try{
  writeFileSync(temporary,JSON.stringify(record)+'\n',{flag:'wx'});created=true;
  // Atomic, exclusive publication. A concurrent collector cannot overwrite a committed close.
  try{linkSync(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;readSnapshot(file,record.date,tickers);return false;}
  return true;
 }finally{if(created)unlinkSync(temporary);}
}
