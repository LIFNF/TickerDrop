const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]);
const root=path.resolve('web/dist');
const remote=process.argv[4];
const routes=/^\/(?:engine|cutoff|mint|book|vault|docs|t\/[A-Z0-9.-]{1,12})\/?$/i;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(name==='/'||routes.test(name)?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.webp')?'image/webp':'text/html');res.end(data);});
});
(async()=>{
 if(!remote){await new Promise(r=>server.listen(0,'127.0.0.1',r));server.unref();}
 const options={headless:true,executablePath:process.argv[3]};
 if(remote){const proxy=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',`[System.Net.WebRequest]::DefaultWebProxy.GetProxy([uri]'${remote}').AbsoluteUri`],{encoding:'utf8'}).trim();if(proxy&&!proxy.startsWith(remote))options.proxy={server:proxy};}
 const browser=await chromium.launch(options);
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(!remote&&process.env.ALLOW_RPC!=='1')await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const base=remote||'http://127.0.0.1:'+server.address().port;
  assert.equal((await page.goto(base+'/mint')).status(),200);
  await page.waitForSelector('.asset-grid .cell');assert.equal(await page.locator('.asset-grid .cell').count(),3172);
  assert.equal((await page.reload()).status(),200);await page.waitForSelector('.asset-grid .cell');
  for(const name of ['engine','cutoff','mint','book','vault','docs']){
   await page.locator(`.top nav a[href="/${name}"]`).click();
   await page.waitForURL(base+'/'+name);assert.equal(await page.locator('.top nav [aria-current="page"]').getAttribute('href'),'/'+name);
  }
  await page.goBack();await page.waitForURL(base+'/vault');
  assert.equal(await page.locator('.top nav [aria-current="page"]').getAttribute('href'),'/vault');
  await page.goForward();await page.waitForURL(base+'/docs');
  assert.equal(await page.locator('.docs-contract').count(),5);
  assert.equal(await page.locator('.source-link').getAttribute('href'),'https://github.com/LIFNF/TickerDrop');
  assert.match(await page.locator('.docs-primary').innerText(),/90\s*%/);
  if(process.env.ALLOW_RPC==='1')await page.getByText('On-chain data synced').waitFor({timeout:30000});
  for(const [lang,title] of [['es','Documentación'],['zh-Hant','文件中心'],['ja','ドキュメント'],['en','Documentation']]){
   await page.locator('.language-switch select').selectOption(lang);
   assert.equal((await page.locator('.docs-heading h1').innerText()).toLocaleLowerCase(),title.toLocaleLowerCase());
   assert.match(await page.locator('.docs-primary').innerText(),/90\s*%/);
  }
  if(process.env.DOCS_SCREENSHOT==='1')await page.screenshot({path:path.resolve('reports/docs-desktop-2026-10-18.png')});
  await page.locator('.top .logo').click();await page.waitForURL(base+'/');
  await page.goto(base+'/?ref=share#mint');await page.waitForURL(base+'/mint?ref=share');await page.waitForSelector('.asset-grid .cell');
  await page.goto(base+'/#t/NVDA');await page.waitForURL(base+'/t/NVDA');await page.waitForSelector('.tkc h2');
  assert.equal(await page.locator('.tkc h2').innerText(),'NVDA');
  assert.equal((await page.reload()).status(),200);await page.waitForSelector('.tkc h2');
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/mint');await page.waitForSelector('.asset-grid .cell');
  assert.ok(await page.locator('.asset-grid').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.goto(base+'/docs');await page.waitForSelector('.docs-contract');
  assert.ok(await page.locator('.docs-screen').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  if(process.env.DOCS_SCREENSHOT==='1')await page.screenshot({path:path.resolve('reports/docs-mobile-2026-10-18.png')});
  if(remote){
   await page.screenshot({path:path.resolve('release/routing-live.png')});
   // Browser navigation uses the same system proxy as the actual UI checks.
   const probe=await browser.newPage();
   try{for(const rel of ['/src/TickerDrop.sol','/.env','/not-a-page'])assert.equal((await probe.goto(base+rel)).status(),404,rel);}
   finally{await probe.close();}
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({directMint:true,refresh:true,sixNavigationLinks:true,docs:true,backForward:true,home:true,legacyHashCanonicalized:true,queryPreserved:true,tickerDeepLink:true,mobile:true,uncaughtErrors:0}));
 }finally{await browser.close();if(!remote)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
