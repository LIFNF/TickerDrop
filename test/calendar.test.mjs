import test from 'node:test';
import assert from 'node:assert/strict';
import { nyTimestamp, sessionSchedule, validateQuoteSession, dayNumber } from '../keeper/calendar.mjs';
test('New York offsets handle both DST boundaries',()=>{
  assert.equal(nyTimestamp('2026-03-06',570),Date.parse('2026-03-06T14:30:00Z')/1000);
  assert.equal(nyTimestamp('2026-03-09',570),Date.parse('2026-03-09T13:30:00Z')/1000);
  assert.equal(nyTimestamp('2026-10-30',570),Date.parse('2026-10-30T13:30:00Z')/1000);
  assert.equal(nyTimestamp('2026-11-02',570),Date.parse('2026-11-02T14:30:00Z')/1000);
});
test('recorded exchange calendar preserves holidays and early closes during catch-up',()=>{
  const s=sessionSchedule({date:'2025-12-24',close:'2025-12-24T13:00:00',nextOpen:'2025-12-26T09:30:00'},{},'2025-12-29');
  assert.equal(s.closedAt,Date.parse('2025-12-24T18:00:00Z')/1000);
  assert.equal(s.nextOpen,Date.parse('2025-12-26T14:30:00Z')/1000);
});
test('latest exchange calendar can supply a legacy snapshot next open',()=>{
  const s=sessionSchedule({date:'2026-10-14',close:'2026-10-14T16:00:00'},{previousTradeDate:'Oct 14, 2026',isBusinessDay:true,openRaw:'2026-10-15T09:30:00'},'2026-10-15');
  assert.equal(s.nextOpen,nyTimestamp('2026-10-15',570));
});
test('conflicting next opens, weekends and missing historical calendar halt settlement',()=>{
  assert.throws(()=>sessionSchedule({date:'2026-10-14',close:'2026-10-14T16:00:00',nextOpen:'2026-10-16T09:30:00'},{previousTradeDate:'Oct 14, 2026',isBusinessDay:true,openRaw:'2026-10-15T09:30:00'},'2026-10-15'),/conflicts/);
  assert.throws(()=>sessionSchedule({date:'2026-10-14',close:'2026-10-14T16:00:00'},{},'2026-10-19'));
  assert.throws(()=>sessionSchedule({date:'2026-10-17',close:'2026-10-17T16:00:00',nextOpen:'2026-10-19T09:30:00'},{},'2026-10-19'),/Weekend/);
});
test('incomplete quotes and unsafe units never reach settlement',()=>{
  const t=[{s:'AAA'},{s:'BBB'}];
  validateQuoteSession({date:'2026-10-14',gains:[-1000000,0]},t);
  assert.throws(()=>validateQuoteSession({date:'2026-10-14',gains:[100,null]},t),/Missing quotes/);
  assert.throws(()=>validateQuoteSession({date:'2026-10-14',gains:[100]},t),/Incomplete/);
  assert.throws(()=>validateQuoteSession({date:'2026-10-14',gains:[0,Infinity]},t),/Invalid gain/);
  assert.throws(()=>dayNumber('2026-02-30'),/Invalid/);
});
