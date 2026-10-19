// Confirmed on-chain event monitor. Emits workflow annotations, never external messages.
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {parseAbi} from 'viem';
import {pub,deployed,root} from './lib.mjs';
import {safeError} from './safe-error.mjs';
const events=parseAbi([
 'event BootstrapETHDonationIncluded(uint256 donationAmount)',
 'event BootstrapSnapshot(uint256 isolatedNativeETH,uint256 pairTokens,uint256 pairWETH,uint256 tokenAdded,uint256 ethAdded,uint256 lpLocked)',
 'event LiquidityAddedAndBurned(uint256 tokenUsed,uint256 ethUsed,uint256 lpBurned,address indexed pair,address indexed sink)',
 'event SettlementStarted(uint32 indexed day,uint64 snapshotAt,uint64 startedAt,uint256 ethPot,uint256 tknPot)',
 'event CalendarCorrectionProposed(uint32 indexed previousDay,uint64 indexed nonce,uint64 correctedNextOpen,uint64 readyAt,bytes32 evidenceHash)',
 'event CalendarLinkCorrected(uint32 indexed previousDay,uint64 indexed revision,uint64 oldNextOpen,uint64 correctedNextOpen,bytes32 evidenceHash)',
 'event CalendarCorrectionCancelled(uint32 indexed previousDay,uint64 indexed nonce)',
 'event CalendarCorrectionDiscarded(uint32 indexed previousDay,uint64 indexed nonce)',
 'event SignersRotated(uint64 indexed epoch,address[] signers)',
 'event RotationScheduled(uint64 indexed epoch,uint64 indexed nonce,bytes32 signersHash,uint64 readyAt)',
]);
async function main(){
 if(deployed.version<3)return;
 if(await pub.getChainId()!==deployed.chainId)throw Error('Monitor RPC chain mismatch');
 if(!await pub.readContract({address:deployed.liquidityVault,abi:parseAbi(['function configurationValid() view returns(bool)']),functionName:'configurationValid'}))throw Error('ALERT: pinned DEX configuration changed');
 const file=new URL('data/monitor-state.json',root),latest=await pub.getBlockNumber();
 const confirmed=latest>12n?latest-12n:0n;
 let old=existsSync(file)?JSON.parse(readFileSync(file)):undefined;
 const id=deployed.chainId+':'+deployed.marketOracle.toLowerCase();
 if(old?.deployment!==id)old=undefined;
 if(old&&BigInt(old.block)<=confirmed){const previous=await pub.getBlock({blockNumber:BigInt(old.block)});if(previous.hash!==old.hash){console.log('::warning::Monitor detected a reorganization; replaying the overlap');old=undefined;}}
 if(!old&&(deployed.deploymentBlock===undefined||deployed.deploymentBlock===null))throw Error('Monitor requires the deployment start block; refusing to skip early events');
 let start=old?BigInt(old.block)+1n:BigInt(deployed.deploymentBlock);
 if(start>confirmed)return;
 const end=start+19999n<confirmed?start+19999n:confirmed;
 let count=0;
 for(let from=start;from<=end;from+=2000n){
  const to=from+1999n<end?from+1999n:end;
  const logs=await pub.getLogs({address:[deployed.liquidityVault,deployed.marketOracle,deployed.pool],events,fromBlock:from,toBlock:to,strict:true});
  for(const item of logs){
   const sensitive=['SignersRotated','RotationScheduled','CalendarCorrectionProposed','CalendarLinkCorrected'].includes(item.eventName);
   console.log((sensitive?'::warning title=TickerDrop protocol event::':'')+item.eventName+' block='+item.blockNumber+' tx='+item.transactionHash+' args='+JSON.stringify(item.args,(_,v)=>typeof v==='bigint'?v.toString():v));count++;
  }
 }
 const checkpoint=await pub.getBlock({blockNumber:end});
 mkdirSync(new URL('data/',root),{recursive:true});
 const temp=new URL('data/monitor-state.json.tmp',root);
 writeFileSync(temp,JSON.stringify({deployment:id,block:end.toString(),hash:checkpoint.hash})+'\n');renameSync(temp,file);
 console.log('Confirmed event monitor complete: '+count+' events; external messages sent: 0');
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
