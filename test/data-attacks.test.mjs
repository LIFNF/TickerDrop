import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import {gainsById,pricesById,buildRound,gainUnits} from '../keeper/round.mjs';
import {validateQuoteSession} from '../keeper/calendar.mjs';
import {safeError} from '../keeper/safe-error.mjs';
import {findings} from '../web/tools/privacy.mjs';
const source=fs.readFileSync('web/src/lib/reliable.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {limitedText,tickerRows,sessionRows}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
const tickers=[{id:1,s:'AAA'},{id:2,s:'BBB'}];

test('conflicting and repeated quote symbols cannot silently win by row order',()=>{
 const rows=[{symbol:'AAA',pctchange:'1%',lastsale:'$1'},{symbol:' aaa ',pctchange:'99%',lastsale:'$99'}];
 assert.throws(()=>gainsById(rows,tickers),/Duplicate/);assert.throws(()=>pricesById(rows,tickers),/Duplicate/);
 assert.throws(()=>gainsById([...rows].reverse(),tickers),/Duplicate/);
});
test('missing and sparse vectors cannot become a zero-gainer settlement',()=>{
 for(const gains of [new Array(2),[0,null],[0,undefined]]){
  assert.throws(()=>validateQuoteSession({date:'2026-10-16',gains},tickers));
  assert.throws(()=>buildRound(gains,tickers));
 }
 assert.equal(buildRound([0,-100],tickers).picked.length,0);
});
test('malformed price separators and partially numeric percentages are rejected',()=>{
 for(const lastsale of ['$1,2,3','$1 23','$$12','$1,23.45'])assert.equal(pricesById([{symbol:'AAA',lastsale}],tickers)[0],null);
 for(const value of ['12garbage%','1 2%','++1%','Infinity%'])assert.equal(gainUnits(value),0);
});
test('oversized streamed JSON is cancelled before buffering the entire body',async()=>{
 let pulls=0,cancelled=false;
 const response=new Response(new ReadableStream({pull(c){pulls++;c.enqueue(new Uint8Array(64));},cancel(){cancelled=true;}}));
 await assert.rejects(limitedText(response,100),/size/);assert.ok(pulls<=4);assert.equal(cancelled,true);
});
test('declared oversized bodies are rejected immediately and split UTF-8 still decodes',async()=>{
 await assert.rejects(limitedText(new Response('ok',{headers:{'content-length':'999'}}),10),/size/);
 const data=new TextEncoder().encode('芯片');let i=0;
 const response=new Response(new ReadableStream({pull(c){if(i===data.length)c.close();else c.enqueue(data.slice(i,++i));}}));
 assert.equal(await limitedText(response,10),'芯片');
});
test('sparse browser datasets cannot pass array callback validation',()=>{
 assert.throws(()=>tickerRows(new Array(3172)));
 assert.throws(()=>sessionRows([{date:'2026-10-16',gains:new Array(3172)}]));
});
test('credential-bearing operational errors and Vercel tokens are redacted',()=>{
 const token='vcp_'+'Z'.repeat(50),key='a'.repeat(64);
 const result=safeError(new Error(`RPC https://rpc.invalid/private?key=secret Bearer SECRET ${token} ${key}`));
 assert.ok(!result.includes(token));assert.ok(!result.includes(key));assert.ok(!result.includes('key=secret'));assert.ok(!result.includes('Bearer SECRET'));
 assert.ok(findings(token).includes('Vercel token'));
});
