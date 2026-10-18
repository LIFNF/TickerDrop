const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]);
const root=path.resolve('web/dist'),remote=process.argv[4];
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(/^\/(?:|docs|mint)$/.test(pathname)?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(data);});
});
(async()=>{
 if(!remote)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const options={headless:true,executablePath:process.argv[3]};
 if(remote){const proxy=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',`[System.Net.WebRequest]::DefaultWebProxy.GetProxy([uri]'${remote}').AbsoluteUri`],{encoding:'utf8'}).trim();if(proxy&&!proxy.startsWith(remote))options.proxy={server:proxy};}
 const browser=await chromium.launch(options);
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const old=JSON.parse(fs.readFileSync('data/sessions/2026-10-14.json','utf8'));
  // A stale or replaced public file cannot fabricate a signed on-chain allocation.
  await page.route('**/sessions.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([old])}));
  await page.route('https://raw.githubusercontent.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([old])}));
  const base=remote||'http://127.0.0.1:'+server.address().port;
  assert.equal((await page.goto(base+'/')).status(),200);
  for(const [language,text] of [['en','No verified market report. Settlement is pending.'],['es','Sin informe de mercado verificado. Liquidación pendiente.'],['zh-Hant','尚無已驗證行情，等待結算。'],['ja','検証済み市場データがありません。精算待ちです。']]){
   await page.locator('.language-switch select').selectOption(language);
   await page.getByText(text,{exact:true}).waitFor({state:'attached',timeout:30000});
   assert.equal(await page.locator('.picks').count(),0);
   assert.ok(!(await page.locator('body').innerText()).includes('2026-10-14'));
  }
  await page.locator('.language-switch select').selectOption('en');
  await page.goto(base+'/docs');await page.getByText('Trading has not started. No settlement is available yet.',{exact:true}).waitFor({timeout:30000});
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
  await page.getByText('No verified market report. Settlement is pending.',{exact:true}).waitFor({state:'attached'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({staleDataRejected:true,languages:4,desktop:true,mobile:true,liveTradingStatus:true,uncaughtErrors:0}));
 }finally{await browser.close();if(!remote)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;server.close();});
