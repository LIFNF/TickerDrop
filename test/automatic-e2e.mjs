// Local real-EVM test of the actual CLI pipeline. Market responses are explicitly synthetic.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createPublicClient,createWalletClient,http,defineChain,parseEther} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {nyTimestamp} from '../keeper/calendar.mjs';
const root=resolve('.private-automation/e2e-'+Date.now());
for(const dir of ['data','web/src/chain'])mkdirSync(resolve(root,dir),{recursive:true});
const chain=defineChain({id:31337,name:'Isolated test',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1:18547']}}});
const anvil=spawn('anvil',['--silent','--port','18547','--chain-id','31337'],{stdio:'ignore'});
const pub=createPublicClient({chain,transport:http(),pollingInterval:50});
const key=generatePrivateKey(),account=privateKeyToAccount(key),wallet=createWalletClient({account,chain,transport:http()});
const keys=Array.from({length:3},()=>generatePrivateKey()),signers=keys.map(privateKeyToAccount);
function artifact(name){return JSON.parse(readFileSync(resolve('out',name==='MockLiquidityRouter'?'MockLiquidity.sol':name+'.sol',name+'.json'),'utf8'));}
async function receipt(hash){const r=await pub.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r;}
async function deploy(name,args=[]){const a=artifact(name);return (await receipt(await wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args}))).contractAddress;}
async function write(name,address,functionName,args=[],value=0n){return receipt(await wallet.writeContract({address,abi:artifact(name).abi,functionName,args,value}));}
async function read(name,address,functionName,args=[]){return pub.readContract({address,abi:artifact(name).abi,functionName,args});}
async function mine(time){await pub.request({method:'evm_setNextBlockTimestamp',params:[time]});await pub.request({method:'evm_mine',params:[]});}
async function run(file,args=[],extra={}){
 const env={...process.env,TICKERDROP_TEST_ROOT:root,RPC_URL:chain.rpcUrls.default.http[0],FIXTURE_NOW:String(nyTimestamp('2026-10-19',990)*1000),...extra};
 return new Promise((ok,fail)=>{
  const child=spawn(process.execPath,['--import',pathToFileURL(resolve('test/helpers/automatic-quotes.mjs')).href,file,...args],{env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  child.on('error',fail);child.on('exit',code=>code===0?ok(output):fail(Error(file+' failed: '+output)));
 });
}
try{
 for(let i=0;i<100;i++){try{await pub.getChainId();break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.equal(await pub.getChainId(),31337);
 await pub.request({method:'anvil_setBalance',params:[account.address,'0x'+parseEther('100').toString(16)]});
 await mine(nyTimestamp('2026-10-19',540));
 const tickr=await deploy('Tickr'),pool=await deploy('GainPool',[tickr,signers[0].address]);
 const drop=await deploy('TickerDrop',[tickr,pool,'0x41414100004242420000']);
 const vault=await read('Tickr',tickr,'liquidityVault'),router=await deploy('MockLiquidityRouter');
 await write('LiquidityVault',vault,'configure',[drop,router]);
 await write('GainPool',pool,'bind',[drop]);
 const oracle=await deploy('QuorumMarketOracle',[pool,signers.map(s=>s.address),2]);
 await write('GainPool',pool,'bindMarketOracle',[oracle]);
 await write('Tickr',tickr,'setPool',[pool]);
 await write('Tickr',tickr,'transfer',[drop,parseEther('200000')]);
 await write('Tickr',tickr,'approve',[drop,parseEther('30000')]);
 await write('TickerDrop',drop,'fundReferral',[parseEther('30000')]);
 await write('Tickr',tickr,'renounceOwnership');await write('TickerDrop',drop,'openMint');
 await write('TickerDrop',drop,'mint',[[1],'0x0000000000'],parseEther('0.005'));
 assert.ok(await read('Tickr',tickr,'liveAt')>0n);
 await receipt(await wallet.sendTransaction({to:pool,value:parseEther('1')}));
 await pub.request({method:'anvil_setBalance',params:[signers[2].address,'0x'+parseEther('1').toString(16)]});
 writeFileSync(resolve(root,'data/tickers.json'),JSON.stringify([{id:1,s:'AAA'},{id:2,s:'BBB'}]));
 writeFileSync(resolve(root,'web/src/chain/deployed.json'),JSON.stringify({chainId:31337,version:2,status:'active',tickr,pool,drop,liquidityVault:vault,marketOracle:oracle}));
 await mine(nyTimestamp('2026-10-19',990));
 await run('keeper/capture-session.mjs');
 await run('keeper/auto-attest.mjs',['2026-10-19'],{AUTO_SIGNER_KEY:keys[0]});
 await run('keeper/auto-attest.mjs',['2026-10-19'],{AUTO_SIGNER_KEY:keys[1]});
 await run('keeper/assemble-attestations.mjs',['2026-10-19']);
 assert.equal(JSON.parse(readFileSync(resolve(root,'data/attestations/2026-10-19.json'))).signatures.length,2);
 await mine(nyTimestamp('2026-10-20',571));
 const before=await pub.getBalance({address:account.address});
 const env={FIXTURE_STAGE:'open',FIXTURE_NOW:String(nyTimestamp('2026-10-20',571)*1000),RELAYER_KEY:keys[2]};
 await run('keeper/settle.mjs',[],env);
 assert.equal(await read('GainPool',pool,'roundCount'),1n);
 assert.equal(await pub.getBalance({address:account.address})-before,parseEther('1'));
 const balance=await pub.getBalance({address:account.address});
 await run('keeper/settle.mjs',[],env);
 assert.equal(await read('GainPool',pool,'roundCount'),1n);
 assert.equal(await pub.getBalance({address:account.address}),balance);
 console.log(JSON.stringify({localEVM:true,syntheticMarketData:true,capture:true,automaticSigners:2,quorumPublication:true,payoutETH:'1',restartDoesNotPayTwice:true,privateFixtureDirectory:'.private-automation/'}));
}finally{anvil.kill();}
