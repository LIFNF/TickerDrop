import {existsSync} from 'node:fs';
import {keccak256,stringToHex} from 'viem';
import {readSnapshot} from './storage.mjs';
import {sessionSchedule,dayNumber} from './calendar.mjs';
import {pub,deployed,marketOracleAbi,tickers,root,nasdaq,isoOf} from './lib.mjs';

export const calendarEvidenceHash=evidence=>keccak256(stringToHex(JSON.stringify({source:evidence.source,previousDate:evidence.previousDate,date:evidence.date,open:evidence.open,observedMarketOpen:evidence.observedMarketOpen,observedPreviousDate:evidence.observedPreviousDate})));

// Same two source-checking operators approve an exceptional routing repair. This
// never edits the prior report, payout snapshot, fund balance or completed round.
export async function prepareCalendarLink(record,account,signerEpoch,allowPreviousSession=false){
 if(deployed.version<3)return undefined;
 const info=await nasdaq('market-info');
 const sameSession=info.isBusinessDay&&info.openRaw===record.open&&info.closeRaw===record.close&&record.nextOpen===isoOf(info.nextTradeDate)+'T09:30:00'&&record.previousDate===isoOf(info.previousTradeDate);
 const priorSession=allowPreviousSession&&info.isBusinessDay&&isoOf(info.previousTradeDate)===record.date&&info.openRaw===record.nextOpen;
 if(!sameSession&&!priorSession)throw Error('Closing report disagrees with exchange predecessor calendar');
 const previousDay=dayNumber(record.previousDate),contract={address:deployed.marketOracle,abi:marketOracleAbi};
 const {openedAt}=sessionSchedule(record,{},record.date);
 const [, , , publishedNext]=await pub.readContract({...contract,functionName:'session',args:[previousDay]});
 let expected;
 if(publishedNext)expected=Number(await pub.readContract({...contract,functionName:'expectedNextOpen',args:[previousDay]}));
 else {
  const file=['data/sessions/','data/candidates/'].map(dir=>new URL(dir+record.previousDate+'.json',root)).find(existsSync);
  if(!file)return undefined; // First live report may have no predecessor in this deployment.
  expected=sessionSchedule(readSnapshot(file,record.previousDate,tickers),{},record.previousDate).nextOpen;
 }
 if(expected===openedAt)return undefined;
 if(await pub.readContract({...contract,functionName:'calendarCorrectionUsed',args:[previousDay]}))throw Error('Calendar correction already used; refusing a second repair');
 const revision=Number(await pub.readContract({...contract,functionName:'calendarRevision',args:[previousDay]}));
 const nonce=Number(await pub.readContract({...contract,functionName:'calendarNonce',args:[previousDay]}));
 const evidence={source:'Nasdaq market-info',previousDate:record.previousDate,date:record.date,open:record.open,observedMarketOpen:info.openRaw,observedPreviousDate:isoOf(info.previousTradeDate)};
 const evidenceHash=calendarEvidenceHash(evidence);
 const digest=await pub.readContract({...contract,functionName:'calendarLinkDigest',args:[previousDay,BigInt(expected),BigInt(openedAt),evidenceHash]});
 return {previousDay,expected,corrected:openedAt,evidence,evidenceHash,revision,nonce,signerEpoch,signature:await account.sign({hash:digest})};
}
