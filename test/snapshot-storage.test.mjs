import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readSnapshot,writeSnapshot} from '../keeper/storage.mjs';
const tickers=[{s:'AAA'},{s:'BBB'}];
const record={date:'2026-10-16',open:'2026-10-16T09:30:00',close:'2026-10-16T16:00:00',nextOpen:'2026-10-19T09:30:00',gains:[0,1000]};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tickerdrop-snapshot-'));t.after(()=>{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);});return {dir,file:pathToFileURL(path.join(dir,record.date+'.json'))};}
test('snapshots publish atomically and cannot overwrite a committed session',t=>{
 const {dir,file}=fixture(t);assert.equal(writeSnapshot(file,record,tickers),true);
 const before=fs.readFileSync(file,'utf8');assert.equal(writeSnapshot(file,{...record,gains:[999,999]},tickers),false);
 assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(fs.readdirSync(dir).length,1);
 assert.deepEqual(readSnapshot(file,record.date,tickers).gains,record.gains);
});
test('corrupted or wrong-date existing snapshots are not silently treated as complete',t=>{
 const {dir,file}=fixture(t);fs.writeFileSync(file,'{"date":');assert.throws(()=>readSnapshot(file,record.date,tickers));
 assert.throws(()=>writeSnapshot(file,record,tickers));assert.equal(fs.readFileSync(file,'utf8'),'{"date":');assert.equal(fs.readdirSync(dir).length,1);
 fs.writeFileSync(file,JSON.stringify({...record,date:'2026-10-15'}));assert.throws(()=>readSnapshot(file,record.date,tickers),/date mismatch/);
});
test('invalid incomplete quotes never create a visible session file',t=>{
 const {dir,file}=fixture(t);assert.throws(()=>writeSnapshot(file,{...record,gains:[0,null]},tickers));assert.equal(fs.readdirSync(dir).length,0);
});
