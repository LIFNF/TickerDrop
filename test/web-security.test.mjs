import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import {findings,checkBeforeBuild,checkArtifact} from '../web/tools/privacy.mjs';
const src=fs.readFileSync('web/src/lib/reliable.ts','utf8');
const output=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {tickerRows,sessionRows,jsonResource}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
const rows=()=>Array.from({length:3172},(_,i)=>['T'+i.toString(36).toUpperCase(),'Company '+i,i+1]);
test('listing validation rejects missing listings, duplicate codes and non-finite caps',()=>{
 assert.equal(tickerRows(rows()).length,3172);
 assert.throws(()=>tickerRows(rows().slice(1)));
 const duplicate=rows();duplicate[1][0]=duplicate[0][0];assert.throws(()=>tickerRows(duplicate));
 const bad=rows();bad[0][2]=Infinity;assert.throws(()=>tickerRows(bad));
});
test('sessions reject invalid dates, mismatched vectors and unsafe gain values',()=>{
 const good={date:'2026-10-14',gains:Array(3172).fill(0)};
 assert.equal(sessionRows([good]).length,1);
 assert.throws(()=>sessionRows([{...good,date:'2026-02-30'}]));
 assert.throws(()=>sessionRows([good,good]));
 assert.throws(()=>sessionRows([{...good,gains:[1]}]));
 const gains=[...good.gains];gains[0]=NaN;assert.throws(()=>sessionRows([{...good,gains}]));
});
test('a failed request is not permanently cached',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('offline')};
 const load=jsonResource('failure-test',['/primary','/backup'],x=>x);
 await assert.rejects(load());assert.equal(calls,4);
 globalThis.fetch=async()=>new Response('{"ok":true}',{status:200});
 assert.deepEqual(await load(),{ok:true});
});
test('backup copy is used only after primary validation fails',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');return new Response(url==='/primary'?'{}':'{"valid":true}',{status:200});};
 const load=jsonResource('backup-test',['/primary','/backup'],raw=>{if(!raw.valid)throw Error('schema');return raw;});
 assert.deepEqual(await load(),{valid:true});assert.deepEqual(calls,['/primary','/primary','/backup']);
});
test('simultaneous loads share a request and cache valid data',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('[1,2,3]',{status:200});};
 const load=jsonResource('dedupe-test',['/public'],raw=>raw);
 await Promise.all([load(),load(),load()]);await load();assert.equal(calls,1);
});
test('privacy scanner recognizes synthetic credentials without printing values',()=>{
 assert.ok(findings('gh'+'p_'+'x'.repeat(36)).length);
 assert.ok(findings('-----BEGIN '+'PRIVATE KEY-----').length);
 assert.ok(findings('REPORTER_KEY='+'1'.repeat(64)).length);
 assert.deepEqual(findings('A public company name'),[]);
});
test('release source guard and artifact allowlist pass',()=>{checkBeforeBuild();checkArtifact();});

test('artifact gate rejects non-allowlisted source files',()=>{
 const dir=fs.mkdtempSync(new URL('file:///'+process.cwd().replaceAll('\\','/')+'/.private-automation/artifact-test-'));
 try{fs.writeFileSync(dir+'/private.sol','source placeholder');assert.throws(()=>checkArtifact(dir),/Forbidden artifact path/);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('browser-prefixed environment variables cannot bypass the privacy freeze',()=>{
 const previous=process.env.VITE_TEST_SECRET;
 try{process.env.VITE_TEST_SECRET='synthetic-value';assert.throws(()=>checkBeforeBuild(),/VITE_/);}
 finally{if(previous===undefined)delete process.env.VITE_TEST_SECRET;else process.env.VITE_TEST_SECRET=previous;}
});
