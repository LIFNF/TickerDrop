const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]);
const root=path.resolve('web/dist'),remote=process.argv[4];
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(/^\/(?:|engine|cutoff|mint|book|vault|t\/[A-Z0-9.-]+)$/.test(route)?'/index.html':route));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.webp')?'image/webp':'text/html');res.end(data);});
});
const languages=[['en','English','Mint','Invitation code','Available after contract deployment'],['es','Español','Acuñar','Código de invitación','Disponible tras desplegar los contratos'],['zh-Hant','繁體中文','鑄造','邀請碼','待合約部署後開放'],['ja','日本語','ミント','招待コード','コントラクトのデプロイ後に利用可能']];
const deployment=JSON.parse(fs.readFileSync('web/src/chain/deployed.json','utf8'));
const pending=/^0x0{40}$/i.test(deployment.drop),awaiting=!pending&&deployment.status!=='active';
const activation={en:'Automatic settlement activation pending',es:'Pendiente de activar la liquidación automática','zh-Hant':'自動結算待啟用',ja:'自動精算の有効化待ち'};
const connect={en:'Connect your wallet to check eligibility',es:'Conecta tu cartera para consultar los requisitos','zh-Hant':'連接錢包以查看邀請資格',ja:'ウォレットを接続して招待資格を確認'};
(async()=>{
 if(!remote){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();}
 const options={headless:true,executablePath:process.argv[3]};
 if(remote){const proxy=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',`[System.Net.WebRequest]::DefaultWebProxy.GetProxy([uri]'${remote}').AbsoluteUri`],{encoding:'utf8'}).trim();if(proxy&&!proxy.startsWith(remote))options.proxy={server:proxy};}
 const browser=await chromium.launch(options);
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP'}),page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(!remote)await page.route('**/*',request=>new URL(request.request().url()).hostname==='127.0.0.1'?request.continue():request.abort());
  const base=remote||'http://127.0.0.1:'+server.address().port;
  assert.equal((await page.goto(base+'/mint')).status(),200);await page.waitForSelector('.asset-grid .cell');
  assert.equal(await page.locator('html').getAttribute('lang'),'en','English default regardless of browser locale');
  assert.deepEqual(await page.locator('.language-switch option').allTextContents(),languages.map(item=>item[1]));
  await page.locator('.asset-grid .cell').first().click();await page.evaluate(()=>window.navigationMarker='unchanged');
  for(const [id,,title,label,status]of languages){
   await page.locator('.language-switch select').selectOption(id);
   assert.equal(await page.locator('html').getAttribute('lang'),id);assert.equal((await page.locator('#mint h2').innerText()).toLowerCase(),title.toLowerCase());
   // The invitation input is intentionally hidden before the first 50 confirmed wallets.
   assert.equal(await page.getByLabel(label,{exact:true}).count(),0);assert.ok((await page.locator('.invite-box').innerText()).includes(pending?status:awaiting?activation[id]:connect[id]));
   assert.equal(await page.locator('.asset-grid .cell').first().getAttribute('aria-pressed'),'true','Selection preserved');
   assert.equal(await page.evaluate(()=>window.navigationMarker),'unchanged');assert.equal(new URL(page.url()).pathname,'/mint');
   for(const route of ['engine','cutoff','book','vault']){
    await page.locator(`.top nav a[href="/${route}"]`).click();await page.waitForURL(base+'/'+route);
    assert.ok((await page.locator('#'+route+' h2').innerText()).length>0);
    const text=await page.locator('.sheet-body').innerText();assert.ok(!/[\u4e00-\u9fff]/.test(text)||['zh-Hant','ja'].includes(id),'No untranslated Chinese in western languages');assert.ok(!text.includes('{count}'));
   }
   await page.locator('.top nav a[href="/mint"]').click();await page.waitForURL(base+'/mint');
   for(const width of [1440,1024,768,390,320]){
    await page.setViewportSize({width,height:844});
    assert.ok(await page.locator('.top').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Header overflow: '+id+' '+width);
    assert.ok(await page.locator('.invite-box').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Invitation overflow: '+id+' '+width);
    const picker=await page.locator('.language-switch').boundingBox();assert.ok(picker.x+picker.width<=width&&picker.x>=0,'Picker visible');
   }
   fs.mkdirSync('release',{recursive:true});await page.screenshot({path:path.resolve(`release/i18n-${id}-mobile.png`)});
   await page.setViewportSize({width:1440,height:1000});
   await page.reload();await page.waitForSelector('.invite-box');assert.equal(await page.locator('html').getAttribute('lang'),id,'Preference persisted');
   await page.locator('.asset-grid .cell').first().click();await page.evaluate(()=>window.navigationMarker='unchanged');
  }
  await page.goto(base+'/t/NVDA');await page.waitForSelector('.tkc h2');assert.equal(await page.locator('.tkc h2').innerText(),'NVDA');
  for(const [id]of languages){await page.locator('.language-switch select').selectOption(id);assert.ok((await page.locator('.art-caption').innerText()).length>0);}
  await page.goto(base+'/mint');await page.waitForSelector('.invite-box');await page.locator('.language-switch select').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.deepEqual(errors,[]);
  await context.close();
  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};});
  const fallback=await blocked.newPage();if(!remote)await fallback.route('**/*',request=>new URL(request.request().url()).hostname==='127.0.0.1'?request.continue():request.abort());
  await fallback.goto(base+'/mint');await fallback.waitForSelector('.invite-box');assert.equal(await fallback.locator('html').getAttribute('lang'),'en');await fallback.locator('.language-switch select').selectOption('es');assert.equal(await fallback.locator('html').getAttribute('lang'),'es');await blocked.close();
  console.log(JSON.stringify({languages:4,englishDefault:true,orderedMenu:true,pages:5,tickerDetails:true,selectionPreserved:true,noReloadOnSwitch:true,preferenceRestored:true,mobileWidths:[320,390],blockedStorageFallback:true,uncaughtErrors:0,realTransactions:0}));
 }finally{await browser.close();if(!remote)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
