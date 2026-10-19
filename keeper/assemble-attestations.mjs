import {readFileSync,readdirSync,mkdirSync,existsSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {keccak256,stringToHex,recoverAddress} from 'viem';
import {marketRound} from './allocation.mjs';
import {readSnapshot,writeSnapshot} from './storage.mjs';
import {sessionSchedule} from './calendar.mjs';
import {pub,deployed,tickers,dayOf,marketOracleAbi,root} from './lib.mjs';
import {safeError} from './safe-error.mjs';
import {calendarEvidenceHash} from './calendar-link.mjs';
async function main(){
 const date=process.argv[2];if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Supply a session date');
 const file=new URL('data/candidates/'+date+'.json',root),record=readSnapshot(file,date,tickers);
 const quotesHash=keccak256(stringToHex(readFileSync(file,'utf8'))),day=dayOf(date);
 const {picked}=marketRound(record,tickers),{openedAt,closedAt,nextOpen}=sessionSchedule(record,{},date);
 const digest=await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'reportDigest',args:[day,picked.map(p=>p.id),picked.map(p=>p.g),BigInt(openedAt),BigInt(closedAt),BigInt(nextOpen),quotesHash]});
 const signerEpoch=deployed.version>=3?Number(await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'signerEpoch'})):0;
 const dir=new URL('data/attestations/'+date+'/',root),signatures=new Map(),calendarGroups=new Map();
 for(const name of existsSync(dir)?readdirSync(dir):[]){
  if(!/^0x[a-fA-F0-9]{40}\.json$/.test(name))continue;
  const a=JSON.parse(readFileSync(new URL(name,dir),'utf8'));
  if(a.day!==day||a.quotesHash!==quotesHash||(deployed.version>=3&&a.signerEpoch!==signerEpoch))continue; // Old candidates/epochs cannot contribute.
  const signer=await recoverAddress({hash:digest,signature:a.signature});
  if(signer.toLowerCase()!==a.signer?.toLowerCase())throw Error('Invalid recovered attestation signer');
  if(!await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'isSigner',args:[signer]}))throw Error('Unauthorized attestation');
  signatures.set(signer.toLowerCase(),{signer,signature:a.signature});
  const link=a.calendarLink;
  if(link&&deployed.version>=3){
   if(await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'calendarCorrectionUsed',args:[link.previousDay]}))continue;
   if(link.signerEpoch!==signerEpoch||link.corrected!==openedAt||link.evidence?.date!==date||link.previousDay!==dayOf(link.evidence?.previousDate)||link.evidenceHash!==calendarEvidenceHash(link.evidence))throw Error('Invalid calendar correction evidence');
   if(link.revision!==Number(await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'calendarRevision',args:[link.previousDay]})))continue;
   if(link.nonce!==Number(await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'calendarNonce',args:[link.previousDay]})))continue;
   const proofDigest=await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'calendarLinkDigest',args:[link.previousDay,BigInt(link.expected),BigInt(link.corrected),link.evidenceHash]});
   if((await recoverAddress({hash:proofDigest,signature:link.signature})).toLowerCase()!==signer.toLowerCase())throw Error('Invalid calendar approval signer');
   const key=proofDigest,group=calendarGroups.get(key)||{...link,signature:undefined,signatures:[]};
   if(!group.signatures.some(x=>x.signer.toLowerCase()===signer.toLowerCase()))group.signatures.push({signer,signature:link.signature});
   calendarGroups.set(key,group);
  }
 }
 const threshold=Number(await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'threshold'}));
 if(signatures.size<threshold)throw Error('Automatic quote-check quorum not reached; no report finalized');
 const sessions=new URL('data/sessions/',root);mkdirSync(sessions,{recursive:true});
 const snapshot=new URL(date+'.json',sessions);
 if(existsSync(snapshot)&&keccak256(stringToHex(readFileSync(snapshot,'utf8')))!==quotesHash)throw Error('Immutable session already contains another report');
 writeSnapshot(snapshot,record,tickers);
 const target=new URL('data/attestations/'+date+'.json',root);
 const calendarCorrection=[...calendarGroups.values()].find(group=>group.signatures.length>=threshold);
 if(calendarCorrection)calendarCorrection.signatures.sort((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
 const value={day,quotesHash,signerEpoch,calendarCorrection,mode:'operator-automated',signatures:[...signatures.values()].sort((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()))};
 const old=existsSync(target)?JSON.parse(readFileSync(target,'utf8')):undefined;
 if(old&&old.quotesHash!==quotesHash)throw Error('Cannot overwrite a finalized attestation');
 // A later repair quorum or key epoch may refresh proofs, never the quote file.
 if(!old||calendarCorrection||old.signerEpoch!==signerEpoch){
  const temporary=new URL(target.href+'.'+process.pid+'.tmp');
  try{writeFileSync(temporary,JSON.stringify(value)+'\n',{flag:'wx'});renameSync(temporary,target);}
  finally{if(existsSync(temporary))unlinkSync(temporary);}
 }
 console.log('Automatically validated quorum finalized; publication waits for next market open.');
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
