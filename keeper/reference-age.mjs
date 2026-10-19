import {nyTimestamp} from './calendar.mjs';
// Expiry follows the exchange's next opening, including weekends and holidays.
// Without a valid exchange calendar, readers use a conservative 24-hour limit.
export function referenceExpiry(info,capturedAt){
 const now=Date.parse(capturedAt);
 if(!Number.isFinite(now))throw Error('Invalid capture timestamp');
 const next=new Date(info.nextTradeDate+' 00:00 UTC');
 if(!Number.isFinite(next.getTime()))throw Error('Invalid next exchange session');
 const nextDate=next.toISOString().slice(0,10);
 const nextAt=nyTimestamp(nextDate,570)*1000;
 const open=/^(\d{4}-\d{2}-\d{2})T09:30:00$/.exec(info.openRaw??'');
 const close=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):00$/.exec(info.closeRaw??'');
 if(!open||!close||open[1]!==close[1])throw Error('Invalid exchange session');
 const closesAt=nyTimestamp(close[1],Number(close[2])*60+Number(close[3]))*1000;
 const opensAt=nyTimestamp(open[1],570)*1000;
 const regular=info.isBusinessDay&&now>=opensAt&&now<closesAt+20*60000;
 const expiry=regular?now+60*60000:now<opensAt?opensAt+20*60000:nextAt+20*60000;
 if(expiry<=now||expiry-now>10*86400000)throw Error('Invalid reference expiry');
 return new Date(expiry).toISOString();
}
