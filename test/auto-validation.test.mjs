import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAutomaticReport} from '../keeper/auto-validation.mjs';
import {nyTimestamp} from '../keeper/calendar.mjs';
const date='2026-10-16',now=nyTimestamp(date,990)*1000;
function fixture(){
 const tickers=[{id:1,s:'AAA'},{id:2,s:'BBB'}];
 const row={id:1,s:'AAA',price:10,change:120,mode:'delayed_streaming_900'};
 const record={date,open:date+'T09:30:00',close:date+'T16:00:00',nextOpen:'2026-10-19T09:30:00',takenAt:new Date(now).toISOString(),source:'TradingView delayed screener',status:'provisional',matched:2,ranked:[{id:1,g:1200000}],rankingExhausted:false,prices:[row]};
 const fresh={total:2,rows:[row],progress:{ranked:record.ranked,rankingExhausted:false,needsMore:false},secondaryRanking:[{id:1,g:1200000}]};
 const secondary=new Map([[1,{symbol:'AAA',venue:'NASDAQ',date,price:10,change:120}]]);
 return {tickers,record,fresh,secondary};
}
function check(f){return validateAutomaticReport(f.record,f.tickers,f.fresh,f.secondary,now);}
test('automatic review accepts a fresh, corroborated close without human signing',()=>{assert.equal(check(fixture()).picked[0].id,1);});
test('pre-close, stale and future captures cannot be signed',()=>{
 for(const at of [nyTimestamp(date,960),nyTimestamp('2026-10-15',990),nyTimestamp(date,1000)]){const f=fixture();f.record.takenAt=new Date(at*1000).toISOString();assert.throws(()=>check(f));}
});
test('partial ranking universe and an unread boundary are blocked',()=>{
 for(const change of [f=>f.fresh.total=1,f=>f.record.matched=1,f=>f.fresh.progress.needsMore=true]){const f=fixture();change(f);assert.throws(()=>check(f));}
});
test('ranking substitution and mismatched prices are blocked',()=>{
 const f=fixture();f.fresh.progress.ranked=[{id:2,g:1200000}];assert.throws(()=>check(f));
 const g=fixture();g.record.prices=[{...g.record.prices[0],price:9}];assert.throws(()=>check(g));
});
test('wrong listing, venue, date and discrepant secondary quote are blocked',()=>{
 for(const patch of [{symbol:'BBB'},{venue:'NYSE'},{date:'2026-10-15'},{price:11},{change:120.03},{price:NaN}]){const f=fixture();f.secondary.set(1,{...f.secondary.get(1),...patch});assert.throws(()=>check(f));}
 const f=fixture();f.secondary.clear();assert.throws(()=>check(f));
});
test('an omitted higher gainer discovered by Nasdaq blocks signing',()=>{
 const f=fixture();f.fresh.secondaryRanking.push({id:2,g:1300000});assert.throws(()=>check(f));
});
