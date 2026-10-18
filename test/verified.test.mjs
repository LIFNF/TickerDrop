import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,keccak256} from 'viem';
import {verifyPublishedSession} from '../keeper/verified.mjs';
import {dayNumber,sessionSchedule} from '../keeper/calendar.mjs';
const config={chainId:4663,pool:'0x1111111111111111111111111111111111111111'};
const tickers=[{id:1,s:'AAA'},{id:2,s:'BBB'}];
const record={date:'2026-10-16',open:'2026-10-16T09:30:00',close:'2026-10-16T16:00:00',nextOpen:'2026-10-19T09:30:00',gains:[600000,500000]};
const schedule=sessionSchedule(record,{},record.date);
const digest=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint32'},{type:'uint16[]'},{type:'uint32[]'}],[4663n,config.pool,dayNumber(record.date),[1,2],record.gains]));
const signed=()=>Promise.resolve([digest,BigInt(schedule.openedAt),BigInt(schedule.closedAt),BigInt(schedule.nextOpen)]);
test('published allocation and calendar accepted',async()=>{assert.equal((await verifyPublishedSession(record,tickers,config,signed)).digest,digest);});
test('unpublished and tampered allocations rejected',async()=>{
 await assert.rejects(verifyPublishedSession(record,tickers,config,()=>Promise.resolve(['0x'+'0'.repeat(64),0n,0n,0n])));
 await assert.rejects(verifyPublishedSession({...record,gains:[600000,400000]},tickers,config,signed));
});
test('wrong chain and calendar cannot reuse a report',async()=>{
 await assert.rejects(verifyPublishedSession(record,tickers,{...config,chainId:46630},signed));
 await assert.rejects(verifyPublishedSession({...record,nextOpen:'2026-10-20T09:30:00'},tickers,config,signed));
});
