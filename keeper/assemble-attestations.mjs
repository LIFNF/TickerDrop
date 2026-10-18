import {readFileSync,readdirSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {keccak256,stringToHex,recoverAddress} from 'viem';
import {marketRound} from './allocation.mjs';
import {readSnapshot,writeSnapshot} from './storage.mjs';
import {sessionSchedule} from './calendar.mjs';
import {pub,deployed,tickers,dayOf,marketOracleAbi,root} from './lib.mjs';
import {safeError} from './safe-error.mjs';
async function main(){
 const date=process.argv[2];if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Supply a session date');
 const file=new URL('data/candidates/'+date+'.json',root),record=readSnapshot(file,date,tickers);
 const quotesHash=keccak256(stringToHex(readFileSync(file,'utf8'))),day=dayOf(date);
 const {picked}=marketRound(record,tickers),{openedAt,closedAt,nextOpen}=sessionSchedule(record,{},date);
 const digest=await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'reportDigest',args:[day,picked.map(p=>p.id),picked.map(p=>p.g),BigInt(openedAt),BigInt(closedAt),BigInt(nextOpen),quotesHash]});
 const dir=new URL('data/attestations/'+date+'/',root),signatures=new Map();
 for(const name of existsSync(dir)?readdirSync(dir):[]){
  if(!/^0x[a-fA-F0-9]{40}\.json$/.test(name))continue;
  const a=JSON.parse(readFileSync(new URL(name,dir),'utf8'));
  if(a.day!==day||a.quotesHash!==quotesHash)continue; // Old failed candidates cannot contribute.
  const signer=await recoverAddress({hash:digest,signature:a.signature});
  if(signer.toLowerCase()!==a.signer?.toLowerCase())throw Error('Invalid recovered attestation signer');
  if(!await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'isSigner',args:[signer]}))throw Error('Unauthorized attestation');
  signatures.set(signer.toLowerCase(),{signer,signature:a.signature});
 }
 const threshold=Number(await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'threshold'}));
 if(signatures.size<threshold)throw Error('Automatic quote-check quorum not reached; no report finalized');
 const sessions=new URL('data/sessions/',root);mkdirSync(sessions,{recursive:true});
 const snapshot=new URL(date+'.json',sessions);
 if(existsSync(snapshot)&&keccak256(stringToHex(readFileSync(snapshot,'utf8')))!==quotesHash)throw Error('Immutable session already contains another report');
 writeSnapshot(snapshot,record,tickers);
 const target=new URL('data/attestations/'+date+'.json',root);
 const value={day,quotesHash,mode:'operator-automated',signatures:[...signatures.values()].sort((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()))};
 if(!existsSync(target))writeFileSync(target,JSON.stringify(value)+'\n',{flag:'wx'});
 else if(JSON.parse(readFileSync(target,'utf8')).quotesHash!==quotesHash)throw Error('Cannot overwrite a finalized attestation');
 console.log('Automatically validated quorum finalized; publication waits for next market open.');
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
