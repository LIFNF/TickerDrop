// Refresh only a calendar approval over an already signed, immutable price report.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {keccak256,stringToHex,getAddress,recoverAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {pub,deployed,marketOracleAbi,root,dayOf,tickers} from './lib.mjs';
import {readSnapshot} from './storage.mjs';
import {sessionSchedule} from './calendar.mjs';
import {marketRound} from './allocation.mjs';
import {prepareCalendarLink} from './calendar-link.mjs';
import {saveOperatorAttestation} from './operator-output.mjs';
import {safeError} from './safe-error.mjs';
async function main(){
 if(deployed.version<3)return;
 if(await pub.getChainId()!==deployed.chainId)throw Error('Calendar refresh RPC mismatch');
 const contract={address:deployed.marketOracle,abi:marketOracleAbi};
 const previousDay=await pub.readContract({...contract,functionName:'lastPublishedDay'});if(!previousDay)return;
 if(await pub.readContract({...contract,functionName:'calendarCorrectionUsed',args:[previousDay]}))return;
 const nonce=Number(await pub.readContract({...contract,functionName:'calendarNonce',args:[previousDay]}));
 const required=await pub.readContract({...contract,functionName:'expectedNextOpen',args:[previousDay]});
 const dir=new URL('data/candidates/',root);if(!existsSync(dir))return;
 const date=readdirSync(dir).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).map(x=>x.slice(0,10)).find(date=>{
  const record=JSON.parse(readFileSync(new URL(date+'.json',dir)));
  return record.previousDate&&dayOf(record.previousDate)===previousDay&&BigInt(sessionSchedule(record,{},date).openedAt)!==required;
 });if(!date)return;
 let account;
 for(const key of [process.env.AUTO_SIGNER_KEY,process.env.AUTO_SIGNER_NEXT_KEY]){
  if(!/^(?:0x)?[a-fA-F0-9]{64}$/.test(key||''))continue;
  const candidate=privateKeyToAccount(key.startsWith('0x')?key:'0x'+key);
  if(await pub.readContract({...contract,functionName:'isSigner',args:[candidate.address]})){account=candidate;break;}
 }
 if(!account)throw Error('No authorized calendar operator credential');
 const file=new URL('data/attestations/'+date+'/'+getAddress(account.address)+'.json',root);
 if(!existsSync(file))return;
 const old=JSON.parse(readFileSync(file)),epoch=Number(await pub.readContract({...contract,functionName:'signerEpoch'}));
 if(old.signerEpoch!==epoch)throw Error('Cannot refresh a price report from another signer epoch');
 // Existing current-nonce proofs remain unchanged; only cancellation consumes a nonce.
 if(old.calendarLink?.nonce===nonce)return;
 const candidate=new URL(date+'.json',dir),record=readSnapshot(candidate,date,tickers);
 if(old.quotesHash!==keccak256(stringToHex(readFileSync(candidate,'utf8'))))throw Error('Calendar refresh candidate changed');
 const {picked}=marketRound(record,tickers),{openedAt,closedAt,nextOpen}=sessionSchedule(record,{},date);
 const digest=await pub.readContract({...contract,functionName:'reportDigest',args:[dayOf(date),picked.map(p=>p.id),picked.map(p=>p.g),BigInt(openedAt),BigInt(closedAt),BigInt(nextOpen),old.quotesHash]});
 if((await recoverAddress({hash:digest,signature:old.signature})).toLowerCase()!==account.address.toLowerCase())throw Error('Existing price approval is invalid');
 const calendarLink=await prepareCalendarLink(record,account,epoch,true);
 saveOperatorAttestation(file,{...old,calendarLink},date,getAddress(account.address));
 console.log('Refreshed calendar proof for '+date+'; price report and quotes unchanged.');
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
