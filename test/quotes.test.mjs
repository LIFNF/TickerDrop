import test from 'node:test';
import assert from 'node:assert/strict';
import { pricesById, gainsById } from '../keeper/round.mjs';
const tickers = [{id:1,s:'AAA'},{id:2,s:'BBB'},{id:3,s:'CCC'}];
test('price quotes map by symbol instead of response ordering', () => {
  assert.deepEqual(pricesById([{symbol:'BBB',lastsale:'$1,234.56'},{symbol:' aaa ',lastsale:'$0.745'}],tickers),[0.745,1234.56,null]);
});
test('unavailable and malformed quotes do not become zero or partial numeric values', () => {
  for (const lastsale of ['N/A','',null,'$0','-1','12bad','Infinity']) assert.deepEqual(pricesById([{symbol:'AAA',lastsale}],tickers),[null,null,null]);
});
test('prices and signed gains remain independently recorded', () => {
  const rows = [{symbol:'AAA',lastsale:'$99.50',pctchange:'-0.5%'},{symbol:'BBB',lastsale:'$101',pctchange:'+1%'}];
  assert.deepEqual(pricesById(rows,tickers),[99.5,101,null]);
  assert.deepEqual(gainsById(rows,tickers),[-5000,10000,null]);
});

test('malformed percentages are not partially parsed',()=>{
  for (const pctchange of ['12bad%','N/A','','Infinity%','-100.01%']) assert.deepEqual(gainsById([{symbol:'AAA',pctchange}],tickers),[null,null,null]);
});
