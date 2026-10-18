import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createPublicClient,http,keccak256,zeroAddress} from 'viem';
const manifest=JSON.parse(readFileSync('web/src/chain/deployed.json','utf8'));
const pub=createPublicClient({transport:http('https://rpc.mainnet.chain.robinhood.com',{timeout:30000,retryCount:3})});
const blockNumber=await pub.getBlockNumber();
assert.equal(await pub.getChainId(),4663);assert.equal(manifest.status,'active');
const contracts={Tickr:manifest.tickr,TickerDrop:manifest.drop,GainPool:manifest.pool,LiquidityVault:manifest.liquidityVault,QuorumMarketOracle:manifest.marketOracle};
const abi=name=>JSON.parse(readFileSync(`out/${name}.sol/${name}.json`,'utf8')).abi;
const read=(name,functionName,args=[])=>pub.readContract({address:contracts[name],abi:abi(name),functionName,args,blockNumber});
const same=(a,b)=>assert.equal(a.toLowerCase(),b.toLowerCase());
const hashes={};
for(const [name,address] of Object.entries(contracts)){
 const compiled=JSON.parse(readFileSync(`out/${name}.sol/${name}.json`,'utf8')).deployedBytecode;
 const code=await pub.getCode({address,blockNumber});assert.ok(code&&code!=='0x');hashes[name]=keccak256(code);
 let expected=compiled.object.replace(/^0x/,''),actual=code.slice(2);
 for(const refs of Object.values(compiled.immutableReferences||{}))for(const {start,length} of refs){expected=expected.slice(0,start*2)+'0'.repeat(length*2)+expected.slice((start+length)*2);actual=actual.slice(0,start*2)+'0'.repeat(length*2)+actual.slice((start+length)*2);}
 assert.equal(keccak256('0x'+expected),keccak256('0x'+actual),name+' compiled runtime');
}
for(const name of ['Tickr','TickerDrop','GainPool'])same(await read(name,'owner'),zeroAddress);
same(await read('Tickr','pool'),manifest.pool);same(await read('Tickr','liquidityVault'),manifest.liquidityVault);
same(await read('TickerDrop','tickr'),manifest.tickr);same(await read('GainPool','drop'),manifest.drop);same(await read('GainPool','marketOracle'),manifest.marketOracle);
same(await read('LiquidityVault','drop'),manifest.drop);same(await read('LiquidityVault','token'),manifest.tickr);
assert.equal(await read('LiquidityVault','LIQUIDITY_BPS'),9000n);assert.equal(await read('LiquidityVault','RECIPIENT_BPS'),1000n);
assert.equal(await read('QuorumMarketOracle','threshold'),2);
same(await read('LiquidityVault','router'),await read('LiquidityVault','MAINNET_ROUTER'));
same(await read('LiquidityVault','factory'),await read('LiquidityVault','MAINNET_FACTORY'));
same(await read('LiquidityVault','wrappedNative'),await read('LiquidityVault','MAINNET_WETH'));
const [phase,minted,supply,seeds,liveAt,rounds,lastDay,pot]=await Promise.all([
 read('TickerDrop','phase'),read('TickerDrop','minted'),read('TickerDrop','supply'),read('TickerDrop','seedCount'),read('Tickr','liveAt'),read('GainPool','roundCount'),read('GainPool','lastDay'),read('GainPool','pot')]);
assert.equal(phase,1);assert.equal(supply,3172n);assert.ok(minted<=supply);assert.ok(seeds<=50);
if(minted>0n)assert.ok(liveAt>0n);
const result={checkedAt:new Date().toISOString(),block:blockNumber.toString(),chainId:4663,compiledRuntimeMatches:true,ownersRenounced:true,bindingsMatchFrontend:true,liquidityBps:9000,recipientBps:1000,quoteThreshold:2,phase,minted:minted.toString(),supply:supply.toString(),directWallets:seeds.toString(),liveAt:liveAt.toString(),settledRounds:rounds.toString(),lastDay,feePoolETHWei:pot[0].toString(),feePoolTICKRWei:pot[1].toString(),runtimeCodeHashes:hashes,transactionsSent:0};
writeFileSync('reports/runtime-mainnet-20261019.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
