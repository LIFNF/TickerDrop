// Recover only arrays already committed on-chain. Default is read-only; --resume relays them.
import {mkdirSync,writeFileSync} from 'node:fs';
import {parseAbiItem,decodeFunctionData,encodeAbiParameters,keccak256,createWalletClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {pub,chain,deployed,marketOracleAbi,poolAbi,root} from './lib.mjs';
import {safeError} from './safe-error.mjs';
try{
 if(deployed.version<3)throw Error('Recovery requires reviewed V3 oracle');
 if(await pub.getChainId()!==chain.id)throw Error('Recovery RPC chain mismatch');
 const day=Number(process.argv[2]);if(!Number.isSafeInteger(day)||day<=0)throw Error('Supply a positive epoch day');
 const oracle={address:deployed.marketOracle,abi:marketOracleAbi},pool={address:deployed.pool,abi:poolAbi};
 const [commitment]=await pub.readContract({...oracle,functionName:'session',args:[day]});
 if(/^0x0+$/.test(commitment))throw Error('No published commitment to recover');
 if(deployed.deploymentBlock===undefined||deployed.deploymentBlock===null)throw Error('Recovery needs verified deployment start block');
 const latest=await pub.getBlockNumber();let found;
 for(let from=BigInt(deployed.deploymentBlock);from<=latest;from+=5000n){
  const to=from+4999n<latest?from+4999n:latest;
  const logs=await pub.getLogs({address:deployed.marketOracle,event:parseAbiItem('event Published(uint32 indexed day,bytes32 commitment,bytes32 quotesHash)'),args:{day},fromBlock:from,toBlock:to,strict:true});
  if(logs.length){if(found||logs.length!==1)throw Error('Ambiguous on-chain publication');found=logs[0];break;}
 }
 if(!found)throw Error('Publication log unavailable; archive RPC is required');
 const tx=await pub.getTransaction({hash:found.transactionHash});
 if(tx.to?.toLowerCase()!==deployed.marketOracle.toLowerCase())throw Error('Publication was wrapped; direct oracle transaction calldata is unavailable');
 const decoded=decodeFunctionData({abi:marketOracleAbi,data:tx.input});
 if(decoded.functionName!=='publish'||decoded.args[0]!==day)throw Error('Publication calldata mismatch');
 const [,ids,gains,openedAt,closedAt,nextOpen,quotesHash]=decoded.args;
 const actual=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint32'},{type:'uint16[]'},{type:'uint32[]'}],[BigInt(chain.id),deployed.pool,day,ids,gains]));
 if(actual!==commitment||found.args.commitment!==commitment||found.args.quotesHash!==quotesHash)throw Error('Recovered arrays do not match the on-chain commitment');
 mkdirSync(new URL('data/recovery/',root),{recursive:true});
 writeFileSync(new URL('data/recovery/'+day+'.json',root),JSON.stringify({day,ids,gains,openedAt:openedAt.toString(),closedAt:closedAt.toString(),nextOpen:nextOpen.toString(),quotesHash,commitment,publicationTransaction:tx.hash})+'\n');
 if(process.argv.includes('--resume')){
  const key=process.env.RELAYER_KEY;if(!/^(?:0x)?[a-fA-F0-9]{64}$/.test(key||''))throw Error('Recovery relayer missing');
  const account=privateKeyToAccount(key.startsWith('0x')?key:'0x'+key),wallet=createWalletClient({account,chain,transport:http()});
  for(let batches=0;batches<80;batches++){
   if(await pub.readContract({...pool,functionName:'lastDay'})>=day)break;
   const pending=await pub.readContract({...pool,functionName:'pendingDay'});
   if(pending!==0&&pending!==day)throw Error('Another earlier settlement must finish first');
   const functionName=pending?'continueSettlement':'settle',args=pending?[ids,gains]:[day,ids,gains];
   const {request}=await pub.simulateContract({...pool,account,functionName,args});
   if((await pub.waitForTransactionReceipt({hash:await wallet.writeContract(request)})).status!=='success')throw Error('Recovered settlement reverted');
  }
  if(await pub.readContract({...pool,functionName:'lastDay'})<day)throw Error('Recovery batch limit reached');
 }
 console.log('Recovered verified publication arrays for '+day+(process.argv.includes('--resume')?'; settlement complete.':'; no transactions sent.'));
}catch(e){console.error(safeError(e));process.exitCode=1;}
