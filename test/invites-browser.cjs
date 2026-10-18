// Local-only UI integration test. No RPC requests, private keys, or transactions.
const path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const esbuild=require(path.resolve('web/node_modules/esbuild'));
const {chromium}=require(process.argv[2]);
const wallet=`
import React,{createContext,useContext,useState} from 'react';
const C=createContext(null);const zero='0x0000000000';
const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),root='0x'+'3'.repeat(40);
window.mock=JSON.parse(sessionStorage.getItem('mock-chain')||'null')||{own:{},owners:{'0x524f4f5431':root},uses:{},redeemed:{},seeds:49,writes:0};
const persist=()=>sessionStorage.setItem('mock-chain',JSON.stringify(window.mock));
export const pub={readContract:async({functionName:f,args})=>{
 if(window.failReads)throw Error('PRIVATE_RPC_DETAIL');const k=args?.[0];
 if(f==='seedCount')return BigInt(window.mock.seeds||0);
 if(f==='referralReserve')return 100000000000000000000000000n;
 if(f==='referralEarned')return 0n;
 if(f==='inviteOf')return window.mock.own[k]||zero;
 if(f==='previewInvite')return k===a?'0x4142433132':'0x4445463334';
 if(f==='redeemedInvite')return window.mock.redeemed[k]||zero;
 if(f==='inviteUses')return window.mock.uses[k]||0;
 if(f==='inviteOwner')return window.mock.owners[k]||'0x'+'0'.repeat(40);
 throw Error('Unexpected read');
},simulateContract:async()=>{if(window.race)throw Error('InviteExhausted');}};
export const useWallet=()=>useContext(C);
export function MockWallet({children}){
 const [account,setAccount]=useState(a),[tick,setTick]=useState(0),[busy,setBusy]=useState(false);
 window.switchAccount=setAccount;window.bump=()=>setTick(x=>x+1);
 const send=React.useCallback(async(label,fn)=>{
  setBusy(true);try{await fn({chain:{id:4663},writeContract:async({functionName:f,args})=>{
   window.mock.writes++;
   if(f==='mint'){
    if(!window.mock.own[account]&&window.mock.seeds<50){const code=account===a?'0x4142433132':'0x4445463334';window.mock.seeds++;window.mock.own[account]=code;window.mock.owners[code]=account;}
    else if(args[1]!==zero){window.mock.redeemed[account]=args[1];window.mock.uses[args[1]]=(window.mock.uses[args[1]]||0)+1;}
   }
   persist();return '0x'+'1'.repeat(64);
  }},account);setTick(x=>x+1);return true;}catch{return false;}finally{setBusy(false);}
 },[account]);
 return <C.Provider value={{account,tick,busy,send}}>{children}</C.Provider>;
}`;
const config=`import {parseAbi} from 'viem';export const chain={id:4663};export const addr={drop:'0x'+'4'.repeat(40)};export const live=true;export const contractsDeployed=true;export const dropAbi=parseAbi(['function seedCount() view returns(uint256)','function referralReserve() view returns(uint256)','function referralEarned(address) view returns(uint256)','function mint(uint256[],bytes5) payable','function inviteOf(address) view returns(bytes5)','function inviteOwner(bytes5) view returns(address)','function inviteUses(bytes5) view returns(uint8)','function redeemedInvite(address) view returns(bytes5)']);`;
const entry=`import {createRoot} from 'react-dom/client';import {StrictMode} from 'react';import {MockWallet} from './web/src/lib/wallet';import {InviteProvider,useInvites} from './web/src/lib/invites';import {Invites} from './web/src/components/Invites';function Probe(){const i=useInvites();window.invite=i;return <><Invites/><button id="mint" disabled={!i.valid} onClick={()=>i.mint([1n],1n,'MINT')}>Mint</button></>;}createRoot(document.getElementById('root')).render(<StrictMode><MockWallet><InviteProvider><Probe/></InviteProvider></MockWallet></StrictMode>);`;
(async()=>{
 const build=await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',nodePaths:[path.resolve('web/node_modules')],plugins:[{name:'mock-only',setup(b){b.onResolve({filter:/(^|\/)wallet$/},()=>({path:'wallet',namespace:'mock'}));b.onResolve({filter:/chain\/config$/},()=>({path:'config',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='wallet'?wallet:config,loader:'tsx',resolveDir:path.resolve('web')}));}}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?build.outputFiles[0].contents:'<div id="root"></div><script src="/app.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));server.unref();
 const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});const errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.invite?.seeds===49);
  assert.equal(await page.evaluate(()=>window.mock.writes),0);
  await page.reload();await page.waitForFunction(()=>window.invite?.seeds===49);
  assert.equal(await page.evaluate(()=>window.mock.writes),0);
  await page.locator('#mint').click();await page.waitForFunction(()=>window.invite?.own==='ABC12');
  assert.equal(await page.evaluate(()=>window.mock.seeds),50);
  await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForFunction(()=>window.invite?.own==='ABC12');
  await page.evaluate(()=>window.switchAccount('0x'+'2'.repeat(40)));
  await page.waitForFunction(()=>window.invite?.seeds===50&&window.invite.own==='');
  assert.equal(await page.locator('#mint').isDisabled(),true);
  await page.getByLabel('Invitation code').fill('root1');await page.waitForFunction(()=>window.invite.valid);
  await page.evaluate(()=>window.race=true);await page.locator('#mint').click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.mock.writes),1);
  await page.evaluate(()=>window.race=false);await page.locator('#mint').click();await page.waitForFunction(()=>window.mock.writes===2);
  assert.equal(await page.evaluate(()=>window.mock.redeemed['0x'+'2'.repeat(40)]),'0x524f4f5431');
  await page.evaluate(()=>{window.failReads=true;window.bump();});await page.waitForFunction(()=>window.invite?.message.includes('unavailable'));assert.equal(await page.locator('#mint').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({connectionTakesNoSlot:true,fiftiethMintCreatesCode:true,refreshRestores:true,clearedLocalCacheRecoversFromChain:true,laterWalletNeedsCode:true,walletIsolation:true,lastSlotRacePreflight:true,readFailureBlocksMint:true,uncaughtErrors:0,realTransactions:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

