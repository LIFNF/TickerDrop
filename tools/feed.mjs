// Publish only allocations matching the deployed oracle.
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPublicClient,http,parseAbi} from 'viem';
import {verifyPublishedSession} from '../keeper/verified.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(readFileSync(join(root,'web/src/chain/deployed.json'),'utf8'));
if(config.chainId!==4663||!config.marketOracle||/^0x0+$/.test(config.marketOracle))throw Error('Valid mainnet oracle configuration required');
const client=createPublicClient({transport:http('https://rpc.mainnet.chain.robinhood.com',{timeout:15000,retryCount:2})});
const abi=parseAbi(['function session(uint32 day) view returns(bytes32,uint64,uint64,uint64)','function lastPublishedDay() view returns(uint32)']);
const readSession=day=>client.readContract({address:config.marketOracle,abi,functionName:'session',args:[day]});
const last=await client.readContract({address:config.marketOracle,abi,functionName:'lastPublishedDay'});
const verified=[];
if(last){
 const date=new Date(last*86400000).toISOString().slice(0,10),file=join(root,'data/sessions',date+'.json');
 if(!existsSync(file))throw Error('Latest oracle report has no matching stored snapshot');
 const record=JSON.parse(readFileSync(file,'utf8'));
 const tickers=JSON.parse(readFileSync(join(root,'data/tickers.json'),'utf8'));
 await verifyPublishedSession(record,tickers,config,readSession);
 verified.push({date:record.date,gains:record.gains});
}
for(const name of ['data/verified-sessions.json','web/public/sessions.json']){
 const file=join(root,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(verified)+'\n');
}
console.log('Verified market reports: '+verified.length+'; unverified snapshots excluded.');
