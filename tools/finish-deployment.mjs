// Resume initialization from already-created contracts; never deploy duplicate contracts.
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,createWalletClient,defineChain,http,keccak256,zeroAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {safeError} from '../keeper/safe-error.mjs';
const chain=defineChain({id:4663,name:'Robinhood Chain',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['https://rpc.mainnet.chain.robinhood.com']}}});
const pub=createPublicClient({chain,transport:http(undefined,{timeout:30000,retryCount:3}),pollingInterval:1000});
function artifact(name){return JSON.parse(readFileSync(`out/${name}.sol/${name}.json`,'utf8'));}
const broadcast=JSON.parse(readFileSync('broadcast/Deploy.s.sol/4663/run-latest.json','utf8'));
const addresses={};for(const t of broadcast.transactions){if(t.transactionType==='CREATE'){
 const receipt=broadcast.receipts.find(r=>r.transactionHash===t.hash);
 if(!receipt||receipt.status!=='0x1')throw Error('Creation was not confirmed');
 addresses[t.contractName]=receipt.contractAddress;
}}
const read=(name,fn,args=[])=>pub.readContract({address:addresses[name],abi:artifact(name).abi,functionName:fn,args});
async function main(){
 if(await pub.getChainId()!==4663)throw Error('Wrong chain');
 const secret=process.env.DEPLOYER_PRIVATE_KEY;if(!secret)throw Error('Signing key is not configured');
 const account=privateKeyToAccount(secret),wallet=createWalletClient({account,chain,transport:http()});
 const transactions=[];
 async function send(name,functionName,args=[]){
  const call={account,address:addresses[name],abi:artifact(name).abi,functionName,args};
  await pub.simulateContract(call);
  const estimate=await pub.estimateContractGas(call);
  const hash=await wallet.writeContract({...call,gas:estimate*2n});
  const receipt=await pub.waitForTransactionReceipt({hash});
  if(receipt.status!=='success')throw Error(functionName+' reverted');
  transactions.push({functionName,hash,gasUsed:receipt.gasUsed.toString(),feeWei:(receipt.gasUsed*receipt.effectiveGasPrice).toString()});
  console.log(functionName+' confirmed: '+hash);
 }
 addresses.LiquidityVault=await read('Tickr','liquidityVault');
 for(const [name,address] of Object.entries(addresses)){
  const compiled=artifact(name).deployedBytecode;
  let expected=compiled.object.replace(/^0x/,''),actual=(await pub.getCode({address}))?.slice(2);
  if(!actual)throw Error(name+' has no deployed code');
  for(const refs of Object.values(compiled.immutableReferences||{}))for(const {start,length} of refs){
   expected=expected.slice(0,start*2)+'0'.repeat(length*2)+expected.slice((start+length)*2);
   actual=actual.slice(0,start*2)+'0'.repeat(length*2)+actual.slice((start+length)*2);
  }
  if(keccak256('0x'+expected)!==keccak256('0x'+actual))throw Error(name+' runtime bytecode mismatch');
 }
 const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
 if(!same(await read('TickerDrop','mintRecipient'),account.address))throw Error('Unexpected fixed recipient');
 if(!same(await read('GainPool','marketOracle'),addresses.QuorumMarketOracle)||!same(await read('GainPool','drop'),addresses.TickerDrop))throw Error('Incorrect pool bindings');
 if(await read('LiquidityVault','LIQUIDITY_BPS')!==9000n||await read('QuorumMarketOracle','threshold')!==2)throw Error('Incorrect immutable economics or quorum');
 const local=JSON.parse(readFileSync('.private-automation/accounts.json','utf8'));
 for(const s of local.signers)if(!await read('QuorumMarketOracle','isSigner',[s.address]))throw Error('Automatic signer mismatch');
 const supply=await read('TickerDrop','supply');
 const referralTarget=supply*await read('TickerDrop','INVITE_REWARD');
 const reserved=await read('TickerDrop','referralReserve');
 if(reserved<referralTarget){
  const amount=referralTarget-reserved;
  if(await read('Tickr','allowance',[account.address,addresses.TickerDrop])<amount)await send('Tickr','approve',[addresses.TickerDrop,amount]);
  await send('TickerDrop','fundReferral',[amount]);
 }
 if(await read('Tickr','balanceOf',[addresses.TickerDrop])!==supply*await read('TickerDrop','DROP')+referralTarget)throw Error('NFT reward funding mismatch');
 if(await read('Tickr','balanceOf',[addresses.LiquidityVault])!==635220000n*10n**18n)throw Error('Liquidity inventory mismatch');
 const owner=await read('Tickr','owner');
 if(same(owner,account.address))await send('Tickr','renounceOwnership');else if(!same(owner,zeroAddress))throw Error('Unexpected token owner');
 if(await read('TickerDrop','phase')===0)await send('TickerDrop','openMint');
 for(const name of ['Tickr','GainPool','TickerDrop'])if(!same(await read(name,'owner'),zeroAddress))throw Error(name+' ownership remains');
 if(await read('TickerDrop','phase')!==1)throw Error('Mint is not open');
 const config={chainId:4663,version:2,status:'awaiting-automation',tickr:addresses.Tickr,pool:addresses.GainPool,drop:addresses.TickerDrop,liquidityVault:addresses.LiquidityVault,marketOracle:addresses.QuorumMarketOracle};
 writeFileSync('web/src/chain/deployed.json',JSON.stringify(config,null,2)+'\n');
 const receipts=await Promise.all(broadcast.transactions.filter(t=>t.hash).map(t=>pub.getTransactionReceipt({hash:t.hash})));
 const cost=receipts.reduce((sum,r)=>sum+r.gasUsed*r.effectiveGasPrice,0n)+transactions.reduce((sum,t)=>sum+BigInt(t.feeWei),0n);
 writeFileSync('reports/v2-deployment.json',JSON.stringify({config,transactions,totalGasCostWei:cost.toString(),failedTransactions:receipts.filter(r=>r.status!=='success').map(r=>r.transactionHash),runtimeBytecodeVerified:true,ownersRenounced:true,referralsFunded:true,signers:local.signers.map(s=>s.address),relayer:local.relayer.address},null,2)+'\n');
 console.log(JSON.stringify({deploymentConfirmed:true,runtimeBytecodeVerified:true,ownersRenounced:true,referralsFunded:true,config}));
}
main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
