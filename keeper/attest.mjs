// Independently operated services must verify prices before signing this digest.
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {keccak256,stringToHex,recoverAddress} from 'viem';
import {buildRound} from './round.mjs';
import {readSnapshot} from './storage.mjs';
import {sessionSchedule} from './calendar.mjs';
import {pub,deployed,marketOracleAbi,tickers,dayOf,sessionsDir,log} from './lib.mjs';
import {safeError} from './safe-error.mjs';
async function main(){
 const endpoints=(process.env.QUOTE_ATTESTOR_URLS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(endpoints.length<2)throw Error('At least two independent quote-attestation service URLs must be configured. Wallet addresses alone do not provide market data.');
 for(const endpoint of endpoints){const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password)throw Error('Attestation endpoints must use HTTPS without URL credentials');}
 if(new Set(endpoints.map(x=>new URL(x).hostname)).size<2)throw Error('Quote-attestation services must use distinct hosts');
 const date=process.argv[2];if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Supply a session date');
 const file=new URL(date+'.json',sessionsDir),record=readSnapshot(file,date,tickers);
 const text=readFileSync(file,'utf8'),quotesHash=keccak256(stringToHex(text)),day=dayOf(date);
 const {openedAt,closedAt,nextOpen}=sessionSchedule(record,{},date),{picked}=buildRound(record.gains,tickers);
 const args=[day,picked.map(p=>p.id),picked.map(p=>p.g),BigInt(openedAt),BigInt(closedAt),BigInt(nextOpen),quotesHash];
 const digest=await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'reportDigest',args});
 const results=await Promise.allSettled(endpoints.map(async endpoint=>{
  const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({chainId:deployed.chainId,oracle:deployed.marketOracle,day,quotesHash,digest,snapshot:record}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Attestation service unavailable');
  const text=await response.text();if(text.length>16384)throw Error('Oversized attestation');const result=JSON.parse(text);
  if(result.day!==day||result.quotesHash!==quotesHash||!/^0x[\da-fA-F]{130}$/.test(result.signature||''))throw Error('Attestation is bound to a different report');
  const signer=await recoverAddress({hash:digest,signature:result.signature});
  if(!await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'isSigner',args:[signer]}))throw Error('Unrecognized quote signer');
  return {signer,signature:result.signature};
 }));
 const signatures=[...new Map(results.filter(x=>x.status==='fulfilled').map(x=>[x.value.signer.toLowerCase(),x.value])).values()];
 const threshold=Number(await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'threshold'}));
 if(signatures.length<threshold)throw Error('Independent verified signature quorum unavailable; publication blocked');
 const dir=new URL('../data/attestations/',import.meta.url);mkdirSync(dir,{recursive:true});
 const target=new URL(date+'.json',dir);if(existsSync(target))throw Error('Attestation already exists; refusing to overwrite');
 writeFileSync(target,JSON.stringify({day,quotesHash,signatures})+'\n',{flag:'wx'});log('Verified quote quorum stored');
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
