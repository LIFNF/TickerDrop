const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,devices}=require(process.argv[2]);
const base=process.argv[3]||'https://tickerdrop-theta.vercel.app';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe',edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const proxy=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',"[System.Net.WebRequest]::DefaultWebProxy.GetProxy([uri]'https://tickerdrop-theta.vercel.app').AbsoluteUri"],{encoding:'utf8'}).trim();
const cases=[
 {name:'Windows Chrome',exe:chrome,options:{viewport:{width:1440,height:900}}},
 {name:'Windows Edge',exe:edge,options:{viewport:{width:1366,height:768}}},
 {name:'Android Chrome H5 emulation',exe:chrome,options:devices['Pixel 7'],slow:true},
 {name:'iPhone H5 emulation (Chromium, not Safari engine)',exe:chrome,options:devices['iPhone 13'],slow:true},
];
const results=[];
async function run(profile){
 const browser=await chromium.launch({headless:true,executablePath:profile.exe,proxy:{server:proxy}});
 const started=performance.now(),errors=[],badSiteResponses=[];
 try{
  const context=await browser.newContext({...profile.options,locale:'zh-TW'});
  await context.addInitScript(()=>localStorage.setItem('tickerdrop:language:v1','zh-Hant'));
  const page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=500)badSiteResponses.push({url:new URL(r.url()).pathname,status:r.status()});});
  assert.equal((await page.goto(base+'/mint')).status(),200);
  await page.locator('.asset-grid .cell').first().waitFor();
  assert.equal(await page.locator('.language-switch select').inputValue(),'en');
  assert.equal(await page.locator('.asset-grid .cell').count(),3172);
  const initialLoadMs=Math.round(performance.now()-started);
  await page.locator('.search').fill('NVDA');await page.waitForFunction(()=>document.querySelectorAll('.asset-grid .cell').length===1);
  const card=page.locator('.asset-grid .cell').first();
  if(profile.options.isMobile)await card.tap();else await card.click();
  assert.equal(await card.getAttribute('aria-pressed'),'true');
  // Disconnected wallets must never be able to submit a paid mint.
  assert.equal(await page.locator('.tray>.btn:not(.ghost):not(:disabled)').count(),0,'Paid mint stays disabled without a wallet');
  if(profile.slow){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:75000});}
  for(const route of ['engine','cutoff','book','vault','docs']){
   const link=page.locator(`.top nav a[href="/${route}"]`);
   if(profile.options.isMobile)await link.tap();else await link.click();
   await page.waitForURL(base+'/'+route);
   assert.ok(await page.locator('.top').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   if(route==='docs')assert.equal(await page.locator('.docs-contract').count(),5);
   else await page.locator('#'+route+' h2').waitFor();
  }
  await page.goBack();await page.waitForURL(base+'/vault');await page.goForward();await page.waitForURL(base+'/docs');
  for(const language of ['es','zh-Hant','ja','en']){await page.locator('.language-switch select').selectOption(language);assert.equal(await page.locator('html').getAttribute('lang'),language);}
  await page.locator('.language-switch select').selectOption('zh-Hant');
  await page.reload();await page.locator('.docs-contract').first().waitFor();assert.equal(await page.locator('.language-switch select').inputValue(),'en');
  await page.waitForFunction(()=>document.querySelector('.docs-status')?.textContent.includes('On-chain data synced'),null,{timeout:45000});
  const image=path.resolve('reports/device-'+profile.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.png');fs.mkdirSync('reports',{recursive:true});await page.screenshot({path:image});
  await page.goto(base+'/t/NVDA');await page.locator('.tkc h2').waitFor();assert.equal(await page.locator('.tkc h2').innerText(),'NVDA');
  assert.deepEqual(errors,[]);assert.deepEqual(badSiteResponses,[]);
  results.push({profile:profile.name,passed:true,engine:'Chromium/Blink',touch:!!profile.options.isMobile,throttledCPU:profile.slow?4:1,simulatedLatencyMs:profile.slow?150:0,initialLoadMs,durationMs:Math.round(performance.now()-started),routeChecks:7,languages:4,englishDespiteOldPreference:true,reloadEnglish:true,chainStateSynced:true,disconnectedMintBlocked:true,uncaughtErrors:0,server5xx:0,transactionsSent:0,screenshot:image});
 }catch(e){results.push({profile:profile.name,passed:false,error:e.stack||e.message,errors,badSiteResponses});}
 finally{await browser.close();}
}
(async()=>{
 let next=0;await Promise.all(Array.from({length:2},async()=>{while(next<cases.length)await run(cases[next++]);}));
 fs.writeFileSync('reports/production-device-matrix.json',JSON.stringify({testedAt:new Date().toISOString(),base,realPhysicalDevices:false,appleSafariEngineTested:false,results},null,2));
 console.log(JSON.stringify({profiles:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),physicalDevices:false,paidTransactions:0}));
 if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
