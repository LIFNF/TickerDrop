import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pub,deployed,marketOracleAbi,root,dayOf} from './lib.mjs';
import {safeError} from './safe-error.mjs';
try{
 if(deployed.version>=3){
  const head=await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'lastPublishedDay'});
  if(head&&await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'calendarCorrectionUsed',args:[head]}))process.exit(0);
  const dir=new URL('data/candidates/',root);
  if(head&&existsSync(dir))for(const name of readdirSync(dir).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x))){
   const record=JSON.parse(readFileSync(new URL(name,dir)));
   if(record.previousDate&&dayOf(record.previousDate)===head){
    execFileSync(process.execPath,[fileURLToPath(new URL('assemble-attestations.mjs',import.meta.url)),name.slice(0,10)],{stdio:'inherit',timeout:120000});
   }
  }
 }
}catch(e){console.error(safeError(e));process.exitCode=1;}
