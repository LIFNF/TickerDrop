import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const esbuild=require('../web/node_modules/esbuild');
const ts=require('../web/node_modules/typescript');
const built=esbuild.buildSync({stdin:{contents:`export {t as english} from './web/src/lib/copy.en';export {messages} from './web/src/lib/messages';export {t,tx} from './web/src/lib/copy';export {languages,getLanguage,setLanguage} from './web/src/lib/locale';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',nodePaths:[path.resolve('web/node_modules')]});
const {english,messages,t,tx,languages,getLanguage,setLanguage}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
const fixed=new Set(['','3172','3%','09:30','100%','NASDAQ × ROBINHOOD CHAIN','TICKR','ETH','GAINPOOL','3% · TICKR','3% · ETH','09:30 NY','≥ 1 TICKR','#1 – #100','#101 – #3172','0.005 ETH','0.001 ETH','+100,000','16:00']);
function leaves(value){return typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(leaves):[];}
function sourceFiles(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(path.join(folder,entry.name)):/\.tsx?$/.test(entry.name)?[path.join(folder,entry.name)]:[]);}
function literalOptions(node){return ts.isStringLiteral(node)?[node.text]:ts.isConditionalExpression(node)?[...literalOptions(node.whenTrue),...literalOptions(node.whenFalse)]:[];}
test('all page copy and literal translation calls have three complete translations',()=>{
 const sources=new Set(leaves(english));
 for(const file of sourceFiles('web/src')){
  const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='tx'&&node.arguments[0])for(const value of literalOptions(node.arguments[0]))sources.add(value);ts.forEachChild(node,visit);};visit(ast);
 }
 assert.deepEqual([...sources].filter(source=>!fixed.has(source)&&!messages[source]),[]);
 for(const [source,targets]of Object.entries(messages)){
  assert.equal(targets.length,3,source);
  const tokens=value=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const target of targets){assert.ok(target.trim(),source);assert.deepEqual(tokens(target),tokens(source),source);assert.ok(!target.includes('\uFFFD'),source);}
 }
});
test('English default, exact language order, live nested references and number-safe interpolation',()=>{
 assert.deepEqual(languages.map(item=>item.id),['en','es','zh-Hant','ja']);assert.equal(getLanguage(),'en');
 const space=t.space;const expected={en:'Mint',es:'Acuñar','zh-Hant':'鑄造',ja:'ミント'};
 for(const language of languages){setLanguage(language.id);assert.equal(t.nav.mint,expected[language.id]);assert.equal(space.mint.sub,language.id==='en'?'One NFT per company':messages['One NFT per company'][languages.indexOf(language)-1]);assert.ok(tx('Total rewards {amount} TICKR',{amount:'15,000'}).includes('15,000'));assert.ok(!t.cutoff.capAt('NVDA','10%',3).includes('{'));}
 setLanguage('invalid');assert.equal(getLanguage(),'ja');setLanguage('en');
});
