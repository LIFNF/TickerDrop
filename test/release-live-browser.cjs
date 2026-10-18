const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]);
const manifest=JSON.parse(fs.readFileSync('web/src/chain/deployed.json','utf8'));
const base=process.argv[4];
(async()=>{
 assert.equal(manifest.version,2);assert.equal(manifest.status,'active');
 const proxy=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',"[System.Net.WebRequest]::DefaultWebProxy.GetProxy([uri]'https://tickerdrop-theta.vercel.app').AbsoluteUri"],{encoding:'utf8'}).trim();
 const browser=await chromium.launch({headless:true,executablePath:process.argv[3],...(proxy&&!proxy.startsWith(base)?{proxy:{server:proxy}}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await page.goto(base+'/docs')).status(),200);
  for(const key of ['tickr','pool','drop','liquidityVault','marketOracle'])await page.locator(`.docs-contract[href$="/address/${manifest[key]}"]`).waitFor();
  assert.equal(await page.locator('.docs-contract').count(),5);
  assert.ok(!(await page.locator('body').innerText()).includes('Automatic settlement activation pending'));
  assert.equal((await page.goto(base+'/mint')).status(),200);
  await page.locator('.invite-box [role="status"]').filter({hasText:'Connect your wallet to check eligibility'}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('.top').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({production:true,version:2,contractLinks:5,mintEntryActive:true,mobile:true,uncaughtErrors:0,transactionsSent:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
