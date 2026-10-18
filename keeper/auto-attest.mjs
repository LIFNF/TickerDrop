// Background signing only. Private keys are scoped CI secrets, never browser data.
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256,stringToHex,getAddress} from 'viem';
import {readSnapshot} from './storage.mjs';
import {captureTradingView} from './tradingview.mjs';
import {validateAutomaticReport} from './auto-validation.mjs';
import {sessionSchedule} from './calendar.mjs';
import {pub,deployed,marketOracleAbi,tickers,dayOf,root,nasdaq,isLive} from './lib.mjs';
import {safeError} from './safe-error.mjs';
import {gainsById} from './round.mjs';

async function main(){
 if(!isLive())return console.log('V2 deployment pending; no signature issued.');
 const date=process.argv[2];if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Supply a session date');
 const secret=process.env.AUTO_SIGNER_KEY;
 if(!/^(?:0x)?[a-fA-F0-9]{64}$/.test(secret||''))throw Error('Automatic signer secret is not configured');
 const account=privateKeyToAccount(secret.startsWith('0x')?secret:`0x${secret}`);
 if(await pub.getChainId()!==deployed.chainId)throw Error('Incorrect RPC network');
 if(!await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'isSigner',args:[account.address]}))throw Error('Automatic signer is not authorized by this oracle');
 const file=new URL('data/candidates/'+date+'.json',root),record=readSnapshot(file,date,tickers);
 const fresh=await captureTradingView(tickers),secondary=new Map();
 const screen=await nasdaq('screener/stocks?tableonly=true&limit=10000&offset=0&exchange=nasdaq&download=true');
 const vector=gainsById(screen.rows||[],tickers);
 if(vector.filter(g=>g!==null).length<tickers.length*0.99)throw Error('Secondary ranking coverage is insufficient');
 fresh.secondaryRanking=vector.map((g,i)=>({id:i+1,g})).filter(p=>p.g!==null&&p.g>0);
 const probe=await nasdaq('quote/AAPL/info?assetclass=stocks');
 const stampDate=(value)=>{const match=/^([A-Za-z]{3} \d{1,2}, \d{4})\b/.exec(value||'');const at=match?Date.parse(match[1]+' 12:00:00 GMT'):NaN;return Number.isFinite(at)?new Date(at).toISOString().slice(0,10):'';};
 if(stampDate(probe.primaryData?.lastTradeTimestamp)!==date)throw Error('Secondary quote service has not updated to this session');
 for(const p of fresh.progress.ranked){
  const symbol=tickers[p.id-1].s;
  const quote=await nasdaq('quote/'+encodeURIComponent(symbol)+'/info?assetclass=stocks');
  const d=quote.primaryData,stamp=/^([A-Za-z]{3} \d{1,2}, \d{4})\b/.exec(d?.lastTradeTimestamp||'');
  const at=stamp?Date.parse(stamp[1]+' 12:00:00 GMT'):NaN;
  const percentage=String(d?.percentageChange??'').replace(/%$/,'').trim();
  const price=String(d?.lastSalePrice??'').replace(/^\$/,'').replaceAll(',','').trim();
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(percentage)||!/^\d+(?:\.\d*)?$/.test(price))throw Error('Secondary quote has no valid price or percentage');
  secondary.set(p.id,{symbol:quote.symbol,venue:quote.isNasdaqListed===true&&/^NASDAQ(?:-|$)/.test(quote.exchange)?'NASDAQ':'UNKNOWN',date:Number.isFinite(at)?new Date(at).toISOString().slice(0,10):'',price:Number(price),change:Number(percentage)});
 }
 const {picked}=validateAutomaticReport(record,tickers,fresh,secondary);
 const {openedAt,closedAt,nextOpen}=sessionSchedule(record,{},date);
 const quotesHash=keccak256(stringToHex(readFileSync(file,'utf8'))),day=dayOf(date);
 const digest=await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'reportDigest',args:[day,picked.map(p=>p.id),picked.map(p=>p.g),BigInt(openedAt),BigInt(closedAt),BigInt(nextOpen),quotesHash]});
 const signature=await account.sign({hash:digest});
 const dir=new URL('data/attestations/'+date+'/',root);mkdirSync(dir,{recursive:true});
 const target=new URL(getAddress(account.address)+'.json',dir);
 const value={day,quotesHash,signer:account.address,signature,mode:'operator-automated',checkedAt:new Date().toISOString()};
 if(existsSync(target)){
  const previous=JSON.parse(readFileSync(target,'utf8'));
  if(previous.quotesHash!==quotesHash||previous.signature!==signature)throw Error('Signer already attested a different report');
 }else writeFileSync(target,JSON.stringify(value)+'\n',{flag:'wx'});
 console.log('Automatic source checks passed; report signed without user interaction.');
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
