import {encodeAbiParameters,keccak256} from 'viem';
import {buildRound} from './round.mjs';
import {dayNumber,validateQuoteSession,sessionSchedule} from './calendar.mjs';
import {marketRound} from './allocation.mjs';
export async function verifyPublishedSession(record,tickers,config,readSession){
 const schedule=sessionSchedule(record,{},record.date),day=dayNumber(record.date);
 const [commitment,openedAt,closedAt,nextOpen]=await readSession(day);
 const {picked}=marketRound(record,tickers);
 const digest=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint32'},{type:'uint16[]'},{type:'uint32[]'}],[BigInt(config.chainId),config.pool,day,picked.map(p=>p.id),picked.map(p=>p.g)]));
 if(!nextOpen||commitment!==digest||Number(openedAt)!==schedule.openedAt||Number(closedAt)!==schedule.closedAt||Number(nextOpen)!==schedule.nextOpen)throw Error('Snapshot does not match a published oracle report');
 return {day,digest};
}
