import {parseAbi,createWalletClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {pub,chain,deployed} from './lib.mjs';
import {safeError} from './safe-error.mjs';
try{
 if(deployed.version>=3){
  if(await pub.getChainId()!==chain.id)throw Error('Liquidity maintenance RPC mismatch');
  const abi=parseAbi(['function priceUpdatedAt() view returns(uint64)','function observationTimestamp() view returns(uint32)','function updatePriceObservation()']);
  const contract={address:deployed.liquidityVault,abi};
  if(await pub.readContract({...contract,functionName:'priceUpdatedAt'})>0n){
   const timestamp=await pub.readContract({...contract,functionName:'observationTimestamp'}),block=await pub.getBlock();
   if(BigInt.asUintN(32,block.timestamp-BigInt(timestamp))>=1800n){
    if(process.env.DRY==='1')console.log('Liquidity observation is due; dry run only.');
    else {
     const key=process.env.RELAYER_KEY;if(!/^(?:0x)?[a-fA-F0-9]{64}$/.test(key||''))throw Error('Liquidity maintenance relayer missing');
     const account=privateKeyToAccount(key.startsWith('0x')?key:'0x'+key),wallet=createWalletClient({account,chain,transport:http()});
     const {request}=await pub.simulateContract({...contract,account,functionName:'updatePriceObservation'});
     if((await pub.waitForTransactionReceipt({hash:await wallet.writeContract(request)})).status!=='success')throw Error('Liquidity observation update reverted');
     console.log('Liquidity price observation advanced.');
    }
   }
  }
 }
}catch(e){console.error(safeError(e));process.exitCode=1;}
