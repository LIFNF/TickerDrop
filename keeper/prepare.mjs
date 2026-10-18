import {existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pub,deployed,poolAbi,sessionsDir,dayOf,log} from './lib.mjs';
import {safeError} from './safe-error.mjs';
import {parseAbi} from 'viem';
import {fileURLToPath} from 'node:url';
import {nyTimestamp} from './calendar.mjs';
async function main(){
 const liveAt=Number(await pub.readContract({address:deployed.tickr,abi:parseAbi(['function liveAt() view returns(uint64)']),functionName:'liveAt'}));
 if(!liveAt)return log('Trading has not started; no settlement can be prepared.');
 const last=await pub.readContract({address:deployed.pool,abi:poolAbi,functionName:'lastDay'});
 const files=existsSync(sessionsDir)?readdirSync(sessionsDir).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort():[];
 for(const file of files){const date=file.slice(0,10),day=dayOf(date);if(day<=last||nyTimestamp(date,570)<liveAt)continue;
  const target=new URL('../data/attestations/'+file,import.meta.url);if(existsSync(target))continue;
  execFileSync(process.execPath,[fileURLToPath(new URL('attest.mjs',import.meta.url)),date],{stdio:'inherit',timeout:120000});
 }
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
