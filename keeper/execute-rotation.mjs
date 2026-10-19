// Executes an already approved timelocked rotation; cannot propose keys or bypass the quorum.
import {createWalletClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chain,deployed,pub,marketOracleAbi} from './lib.mjs';
import {safeError} from './safe-error.mjs';
async function main(){
 if(deployed.version<3)return;
 if(await pub.getChainId()!==chain.id)throw Error('Incorrect rotation RPC network');
 const contract={address:deployed.marketOracle,abi:marketOracleAbi};
 const ready=await pub.readContract({...contract,functionName:'rotationReadyAt'});
 if(!ready)return;
 const block=await pub.getBlock();
 if(block.timestamp<ready)return console.log('Key rotation timelock is still active.');
 const secret=process.env.RELAYER_KEY;
 if(!/^(?:0x)?[a-fA-F0-9]{64}$/.test(secret||''))throw Error('Rotation relayer is not configured');
 const account=privateKeyToAccount(secret.startsWith('0x')?secret:'0x'+secret);
 let request;
 try{({request}=await pub.simulateContract({...contract,account,functionName:'executeRotation'}));}
 catch(e){
  if(e?.walk?.(cause=>cause?.data?.errorName==='UnsafeRotationWindow'))return console.log('Key rotation waits for the next fully settled opening window.');
  throw e;
 }
 if(process.env.DRY==='1')return console.log('Approved key rotation can execute; dry run only.');
 const wallet=createWalletClient({account,chain,transport:http(chain.rpcUrls.default.http[0])});
 const hash=await wallet.writeContract(request);
 const receipt=await pub.waitForTransactionReceipt({hash});
 if(receipt.status!=='success')throw Error('Key rotation transaction reverted');
 console.log('Approved key rotation executed: '+hash);
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
