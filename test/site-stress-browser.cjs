const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]);const root=path.resolve('web/dist');let faults='none';
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 if((faults==='primary'&&/^\/(tickers|sessions)\.json$/.test(route))||(faults==='all'&&/^\/(?:backup\/)?(tickers|sessions)\.json$/.test(route))){res.setHeader('Content-Type','application/json');res.end('{"invalid":true}');return;}
 const file=path.resolve(root,'.'+(/^\/(?:|engine|cutoff|mint|book|vault|t\/[A-Z0-9.-]+)$/.test(route)?'/index.html':route));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.webp')?'image/webp':'text/html');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
 try{
  const cases=Array.from({length:12},(_,index)=>({index,language:['en','es','zh-Hant','ja'][index%4],width:[1440,768,390][Math.floor(index/4)]})),timings=[];const errors=[];
  let next=0,active=0,peak=0;
  await Promise.all(Array.from({length:4},async()=>{
   while(next<cases.length){const current=cases[next++];active++;peak=Math.max(peak,active);const started=performance.now();
    const context=await browser.newContext({viewport:{width:current.width,height:900},isMobile:current.width===390,hasTouch:current.width===390}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',request=>new URL(request.request().url()).hostname==='127.0.0.1'?request.continue():request.abort());
    await page.goto(base+'/mint');await page.waitForSelector('.asset-grid .cell');assert.equal(await page.locator('.asset-grid .cell').count(),3172);
    await page.locator('.language-switch select').selectOption(current.language);await page.locator('.search').fill('NVDA');await page.waitForFunction(()=>document.querySelectorAll('.asset-grid .cell').length===1);await page.locator('.asset-grid .cell').click();
    await page.locator('.top nav a[href="/cutoff"]').click();await page.waitForSelector('#cutoff h2');await page.locator('#cutoff .tabs button').last().click();await page.locator('.top nav a[href="/book"]').click();await page.waitForSelector('#book h2');await page.goBack();await page.waitForSelector('#cutoff h2');
    assert.ok(await page.locator('.top').evaluate(element=>element.scrollWidth<=element.clientWidth+1));timings.push(Math.round(performance.now()-started));await context.close();active--;
   }
  }));assert.deepEqual(errors,[]);
  faults='primary';let context=await browser.newContext(),page=await context.newPage();await page.route('**/*',request=>new URL(request.request().url()).hostname==='127.0.0.1'?request.continue():request.abort());await page.goto(base+'/mint');await page.waitForSelector('.asset-grid .cell');assert.equal(await page.locator('.asset-grid .cell').count(),3172);assert.ok((await page.locator('.data-health').innerText()).includes('backup'));await context.close();
  faults='all';context=await browser.newContext();page=await context.newPage();await page.route('**/*',request=>new URL(request.request().url()).hostname==='127.0.0.1'?request.continue():request.abort());await page.goto(base+'/mint');await page.waitForSelector('.data-health');assert.equal(await page.locator('.asset-grid .cell').count(),0);assert.equal(await page.locator('.tray>.btn:not(:disabled)').count(),0);await context.close();
  faults='none';context=await browser.newContext();page=await context.newPage();await page.route('**/*',request=>/PrivyWalletBridge-|vendor-wallet-/.test(request.request().url())?request.abort():new URL(request.request().url()).hostname==='127.0.0.1'?request.continue():request.abort());await page.goto(base+'/mint');await page.waitForSelector('.asset-grid .cell');await page.locator('.top>.btn').click();await page.waitForSelector('.wallet-service-message[role="alert"]');assert.equal(await page.locator('.asset-grid .cell').count(),3172);await page.locator('.search').fill('AAPL');await page.waitForFunction(()=>document.querySelectorAll('.asset-grid .cell').length===1);await context.close();
  const result={sessions:12,peakConcurrentSessions:peak,languages:4,widths:[1440,768,390],noUncaughtUiErrors:true,backupRecovery:true,invalidDataBlocksMint:true,walletFailureDoesNotCrashSite:true,localLoadOnly:true,realTransactions:0,medianScenarioMs:[...timings].sort((a,b)=>a-b)[Math.floor(timings.length/2)],maxScenarioMs:Math.max(...timings)};
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/frontend-concurrency-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
