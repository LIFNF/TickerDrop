// Checks hosted signing credentials without authorizing a market report or sending a transaction.
import {privateKeyToAccount} from 'viem/accounts';
import {recoverMessageAddress} from 'viem';
import {randomBytes} from 'node:crypto';
import {pub,deployed,marketOracleAbi} from './lib.mjs';
import {safeError} from './safe-error.mjs';
async function main(){
 const key=process.env.AUTOMATION_KEY;
 if(!/^0x[a-fA-F0-9]{64}$/.test(key||''))throw Error('Hosted automation credential missing');
 if(await pub.getChainId()!==deployed.chainId)throw Error('RPC chain mismatch');
 const account=privateKeyToAccount(key);
 if(process.argv.includes('--relayer')){
  const balance=await pub.getBalance({address:account.address});
  if(balance===0n)throw Error('Automatic transaction sender has no gas');
  console.log(JSON.stringify({role:'relayer',address:account.address,gasBalanceWei:balance.toString(),transactionsSent:0}));return;
 }
 if(!await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'isSigner',args:[account.address]}))throw Error('Hosted signer does not match production oracle');
 const message='TickerDrop credential health check only; not a market attestation: '+randomBytes(32).toString('hex');
 const signature=await account.signMessage({message});
 if((await recoverMessageAddress({message,signature})).toLowerCase()!==account.address.toLowerCase())throw Error('Hosted signing self-check failed');
 console.log(JSON.stringify({role:'signer',address:account.address,authorized:true,signingSelfCheck:true,marketReportsSigned:0}));
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
