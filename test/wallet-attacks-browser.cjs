const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const esbuild=require(path.resolve('web/node_modules/esbuild'));
const {chromium}=require(process.argv[2]);
const source=`import {createRoot} from 'react-dom/client';import {useState} from 'react';import {WalletProvider,useWallet,pub} from './web/src/lib/wallet';
window.receiptMode='success';window.lastResult=null;
pub.waitForTransactionReceipt=async({onReplaced})=>{
 if(window.receiptMode==='hold')return new Promise(r=>window.finish=()=>r({status:'success'}));
 if(['cancelled','replaced','repriced'].includes(window.receiptMode))onReplaced({reason:window.receiptMode,transaction:{hash:'0x'+'2'.repeat(64)}});
 return {status:'success'};
};
function Probe(){const w=useWallet();return <><span id="ready">{w.account}</span><span id="busy">{String(w.busy)}</span><button id="send" onClick={async()=>{window.lastResult='pending';window.lastResult=await w.send('TEST',async(client,a)=>{
  if(window.holdBeforeSign)await new Promise(r=>window.resume=r);
  return client.writeContract({account:a,chain:client.chain,address:'0x'+'4'.repeat(40),abi:[{type:'function',name:'touch',stateMutability:'nonpayable',inputs:[],outputs:[]}],functionName:'touch',gas:100000n,gasPrice:1n});
 });}}>Send</button>{w.toasts.map(t=><p key={t.id}>{t.kind}:{t.text}</p>)}</>}
function Root(){const [provider,setProvider]=useState(window.ethereum),[preferred,setPreferred]=useState();window.replaceProvider=()=>setProvider({request:window.ethereum.request,on:window.ethereum.on,removeListener:window.ethereum.removeListener});window.selectAccount=setPreferred;return <WalletProvider connection={{provider,address:preferred,ready:true,connect:async()=>{}}}><Probe/></WalletProvider>;}createRoot(document.getElementById('root')).render(<Root/>);`;
(async()=>{
 const build=esbuild.buildSync({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',nodePaths:[path.resolve('web/node_modules')]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?build.outputFiles[0].contents:'<div id="root"></div><script src="/app.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));server.unref();
 const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(()=>{
   const listeners=new Map();window.account='0x'+'1'.repeat(40);window.network='0x1237';window.signs=0;
   window.changeAccount=a=>{window.account=a;for(const f of listeners.get('accountsChanged')||[])f([a]);};
   window.emitDisconnect=()=>{for(const f of listeners.get('disconnect')||[])f();};
   window.ethereum={on:(n,f)=>listeners.set(n,[...(listeners.get(n)||[]),f]),removeListener:(n,f)=>listeners.set(n,(listeners.get(n)||[]).filter(x=>x!==f)),request:async({method})=>{
    if(method==='eth_accounts'||method==='eth_requestAccounts'){if(method==='eth_accounts'&&window.emptyOnce){window.emptyOnce=false;return [];}return window.accounts||[window.account];}
    if(method==='eth_chainId')return window.network;
    if(method==='wallet_switchEthereumChain')return null;
    if(method==='eth_sendTransaction'){window.signs++;return '0x'+'1'.repeat(64);}
    throw Error('PRIVATE_RPC_DETAIL');
   }};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#ready')?.textContent?.endsWith('1111'));
  for(const mode of ['cancelled','replaced','repriced']){
   await page.evaluate(m=>window.receiptMode=m,mode);await page.locator('#send').click();await page.waitForFunction(()=>typeof window.lastResult==='boolean');
   assert.equal(await page.evaluate(()=>window.lastResult),mode==='repriced',mode);
  }
  const before=await page.evaluate(()=>window.signs);
  await page.evaluate(()=>{window.holdBeforeSign=true;window.receiptMode='success';});await page.locator('#send').click();await page.waitForFunction(()=>!!window.resume);
  await page.evaluate(()=>{window.changeAccount('0x'+'2'.repeat(40));window.resume();});await page.waitForFunction(()=>window.lastResult===false);assert.equal(await page.evaluate(()=>window.signs),before);
  await page.evaluate(()=>{window.resume=null;});await page.locator('#send').click();await page.waitForFunction(()=>!!window.resume);
  await page.evaluate(()=>{window.network='0xb626';window.resume();});await page.waitForFunction(()=>window.lastResult===false);assert.equal(await page.evaluate(()=>window.signs),before);
  await page.evaluate(()=>{window.network='0x1237';window.holdBeforeSign=true;});
  await page.locator('#send').click();await page.waitForFunction(()=>window.lastResult==='pending');
  await page.evaluate(()=>window.replaceProvider());await page.waitForTimeout(50);await page.evaluate(()=>window.resume());
  await page.waitForFunction(()=>window.lastResult===false);assert.equal(await page.evaluate(()=>window.signs),before,'Provider switch with same address blocks stale signer');
  await page.evaluate(()=>{window.accounts=['0x'+'1'.repeat(40),'0x'+'2'.repeat(40)];window.selectAccount('0x'+'2'.repeat(40));});
  await page.waitForFunction(()=>document.querySelector('#ready')?.textContent?.endsWith('2222'));
  await page.evaluate(()=>window.emitDisconnect());await page.waitForFunction(()=>document.querySelector('#ready')?.textContent==='');
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>document.querySelector('#ready')?.textContent?.endsWith('2222'));
  await page.evaluate(()=>{window.emptyOnce=true;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(900);assert.ok((await page.locator('#ready').innerText()).endsWith('2222'));
  assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE_RPC_DETAIL'));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({cancelledNotSuccess:true,differentReplacementNotSuccess:true,repricedAccepted:true,accountSwitchDuringPreflightBlocked:true,networkSwitchDuringPreflightBlocked:true,preferredAccountFromMultiple:true,visibilityReconnect:true,transientEmptyAccountRecovered:true,privateErrorsHidden:true,uncaughtErrors:0,realTransactions:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
