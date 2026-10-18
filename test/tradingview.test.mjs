import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTradingView} from '../keeper/tradingview-parser.mjs';
import {rankProgress} from '../keeper/tradingview-parser.mjs';
import {marketRound} from '../keeper/allocation.mjs';
const t=[{id:1,s:'AAA'}],quote={s:'NASDAQ:AAA',d:['AAA','NASDAQ',12,3,0.3,'delayed_streaming_900','stock','USD']};
test('TradingView mapping preserves price, change and delay status',()=>{assert.deepEqual(parseTradingView({data:[quote]},t),[{id:1,s:'AAA',price:12,change:3,mode:'delayed_streaming_900'}]);});
test('wrong venue, unavailable prices and non-stock assets are not silently mapped',()=>{
 for(const patch of [{s:'NYSE:AAA'},{d:['AAA','NYSE',12,3,0.3,'streaming','stock','USD']},{d:['AAA','NASDAQ',null,3,0.3,'streaming','stock','USD']},{d:['AAA','NASDAQ',12,3,0.3,'streaming','fund','USD']}])assert.deepEqual(parseTradingView({data:[{...quote,...patch}]},t),[]);
 assert.throws(()=>parseTradingView({data:[quote,quote]},t));
});
test('ranking stops at 100 percent but reads the whole boundary tie',()=>{
 const a=rankProgress([{id:3,change:60},{id:2,change:40}],false);assert.equal(a.needsMore,true);
 const b=rankProgress([{id:3,change:60},{id:2,change:40},{id:1,change:40},{id:4,change:3}],false);
 assert.equal(b.needsMore,false);assert.deepEqual(b.ranked,[{id:3,g:600000},{id:1,g:400000}]);
});
test('insufficient ranking cannot silently distribute the full pool',()=>{
 const tickers=[{id:1,s:'AAA'},{id:2,s:'BBB'}];
 assert.throws(()=>marketRound({ranked:[{id:1,g:100000}]},tickers));
 assert.equal(marketRound({ranked:[{id:1,g:100000}],rankingExhausted:true},tickers).weight,100000);
 assert.equal(rankProgress([{id:1,change:10},{id:2,change:0}],false).needsMore,false);
});
