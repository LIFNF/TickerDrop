const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,devices}=require(process.argv[2]);
const root=path.resolve('web/dist');
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(/^\/(?:|mint)$/.test(route)?'/index.html':route));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.webp')?'image/webp':'text/html');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
 const target=process.argv[4]||'';let dev,devUrl='';
 if(target==='dev'){
  dev=require('node:child_process').spawn(process.execPath,[path.resolve('web/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5175','--strictPort'],{cwd:path.resolve('web'),stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Dev server timeout')),20000);dev.stdout.on('data',data=>{if(String(data).includes('127.0.0.1:5175')){clearTimeout(timer);devUrl='http://127.0.0.1:5175';resolve();}});dev.once('exit',code=>{clearTimeout(timer);reject(Error('Dev server exited: '+code));});});
 }
 const proxy=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',"[System.Net.WebRequest]::DefaultWebProxy.GetProxy([uri]'https://auth.privy.io').AbsoluteUri"],{encoding:'utf8'}).trim();
 const browser=await chromium.launch({headless:true,executablePath:process.argv[3],...(proxy&&!proxy.startsWith('https://auth.privy.io')?{proxy:{server:proxy,bypass:'127.0.0.1,localhost'}}:{})});
 let debugPage;const errors=[],csp=[],consoleErrors=[];
 try{
  const page=await browser.newPage(process.env.TEST_MOBILE==='1'?devices['Pixel 7']:{viewport:{width:1280,height:900}});debugPage=page;page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'){consoleErrors.push(message.text().slice(0,900));if(/Content Security Policy|violates.*directive/i.test(message.text()))csp.push(message.text().slice(0,250));}});
  await page.addInitScript(()=>{
   if(window!==window.top||!['127.0.0.1','localhost','tickerdrop-theta.vercel.app'].includes(location.hostname))return;
   window.walletRequests=[];window.walletWrites=0;window.walletSigns=0;
   const wallets=[['MetaMask','io.metamask','11111111-1111-4111-8111-111111111111','0x'+'1'.repeat(40)],['Rabby Wallet','io.rabby','22222222-2222-4222-8222-222222222222','0x'+'2'.repeat(40)]];
   const announce=[];
   wallets.forEach(([name,rdns,uuid,address])=>{
    const listeners=new Map();let authorized=sessionStorage.getItem('mock-authorized:'+rdns)==='1';
    const provider={isMetaMask:rdns==='io.metamask',isRabby:rdns==='io.rabby',on:(event,fn)=>{listeners.set(event,[...(listeners.get(event)||[]),fn]);return provider;},removeListener:(event,fn)=>{listeners.set(event,(listeners.get(event)||[]).filter(item=>item!==fn));return provider;},request:async({method})=>{
     window.walletRequests.push({name,method});
     if(method==='eth_requestAccounts'){authorized=true;sessionStorage.setItem('mock-authorized:'+rdns,'1');return [address];}
     if(method==='eth_accounts')return authorized?[address]:[];
     if(method==='eth_chainId')return '0x1237';
     if(method==='net_version')return '4663';
     if(method==='wallet_getPermissions')return authorized?[{parentCapability:'eth_accounts'}]:[];
     if(method==='wallet_requestPermissions'){authorized=true;return [{parentCapability:'eth_accounts'}];}
     if(method==='wallet_revokePermissions'){const changed=authorized;authorized=false;sessionStorage.removeItem('mock-authorized:'+rdns);if(changed)for(const fn of listeners.get('accountsChanged')||[])fn([]);return null;}
     if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain')return null;
     if(method==='eth_sendTransaction'){window.walletWrites++;throw Error('REAL_TRANSACTION_FORBIDDEN');}
     if(/sign/i.test(method)){window.walletSigns++;throw Error('SIGNATURE_FORBIDDEN');}
     throw Object.assign(Error('Unsupported mock request'),{code:4200});
    }};
    const info={name,rdns,uuid,icon:'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#ffd400" d="M4 4h24v24H4Z"/></svg>')};
    if(rdns==='io.metamask')window.ethereum=provider;
    announce.push(()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info,provider}})));
   });
   window.addEventListener('eip6963:requestProvider',()=>announce.forEach(fn=>fn()));announce.forEach(fn=>fn());
  });
  const base=target.startsWith('http')?target:(devUrl||'http://127.0.0.1:'+server.address().port);
  await page.goto(base.replace(/\/$/,'')+'/mint');await page.waitForSelector('.invite-box');
  await page.locator('.top>.btn').click();
  if(await page.locator('.wallet-manager[open]').count())await page.locator('.wallet-add').click();
  await page.waitForSelector('#privy-modal-content');
  await page.locator('#privy-modal-content').getByText('MetaMask',{exact:true}).first().waitFor();
  await page.locator('#privy-modal-content').getByText(/^Rabby(?: Wallet)?$/).first().waitFor();
  assert.equal(await page.locator('#privy-modal-content').evaluate(element=>getComputedStyle(element).borderRadius),'0px');
  fs.mkdirSync('release',{recursive:true});await page.screenshot({path:path.resolve('release/privy-wallet-picker.png')});
  await page.locator('#privy-modal-content').getByText(/^Rabby(?: Wallet)?$/).first().click();
  await page.waitForFunction(()=>document.querySelector('.top>.btn')?.textContent?.includes('2222'));
  assert.equal(await page.evaluate(()=>window.walletRequests.some(request=>request.name==='MetaMask'&&request.method==='eth_requestAccounts')),false);
  await page.locator('.top>.btn').click();await page.waitForSelector('.wallet-manager[open]');
  assert.ok((await page.locator('.wallet-accounts').innerText()).includes('Rabby'));
  assert.equal(await page.locator('.wallet-manager').getAttribute('aria-hidden'),'false');
  await page.locator('.wallet-add').click();await page.waitForSelector('#privy-modal-content');
  await page.locator('#privy-modal-content').getByText('MetaMask',{exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('.top>.btn')?.textContent?.includes('1111'));
  await page.locator('.top>.btn').click();await page.waitForSelector('.wallet-manager[open]');
  await page.locator('.wallet-account').filter({hasText:'Rabby'}).click();await page.waitForFunction(()=>document.querySelector('.top>.btn')?.textContent?.includes('2222'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('.top>.btn')?.textContent?.includes('2222'));
  await page.locator('.top>.btn').click();await page.locator('.wallet-manager[open]').waitFor();await page.locator('.wallet-disconnect').click({noWaitAfter:true});
  await page.waitForFunction(()=>!document.querySelector('.wallet-manager')?.open);
  assert.equal(await page.evaluate(()=>window.walletWrites),0);assert.equal(await page.evaluate(()=>window.walletSigns),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({realPrivySdk:true,mobileEmulation:process.env.TEST_MOBILE==='1',publicAppConfiguration:true,pixelModal:true,evmWalletDiscovery:true,userSelectsWallet:true,multipleWallets:true,switching:true,selectionRestored:true,disconnect:true,cspWarnings:csp,realTransactions:0,signatures:0,uncaughtErrors:0}));
 }catch(error){if(debugPage){console.error(JSON.stringify({pageErrors:errors,csp,consoleErrors,visible:(await debugPage.locator('body').innerText()).slice(0,1800)}));fs.mkdirSync('release',{recursive:true});await debugPage.screenshot({path:path.resolve('release/privy-wallet-failure.png')}).catch(()=>{});}throw error;}
 finally{await browser.close();dev?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
