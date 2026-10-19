// New York wall-clock conversion shared by snapshot and settlement.
export function dayNumber(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid session date");
  const n = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10) !== date) throw new Error("Invalid session date");
  return n / 86400000;
}
export function nyTimestamp(date, minutes) {
  const day = dayNumber(date);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) throw new Error("Invalid wall clock");
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(date+"T12:00:00Z"));
  const offset = 12 - Number(parts.find(p=>p.type === "hour").value);
  return day*86400 + minutes*60 + offset*3600;
}
function wall(value) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):00$/.exec(value ?? "");
  if (!m || +m[2] > 23 || +m[3] > 59) throw new Error("Missing/invalid exchange timestamp");
  return {date:m[1], minutes:+m[2]*60 + +m[3], at:nyTimestamp(m[1],+m[2]*60 + +m[3])};
}
export function sessionSchedule(record, currentInfo, currentDate) {
  dayNumber(record.date);
  const open = wall(record.open ?? `${record.date}T09:30:00`);
  const close = wall(record.close);
  const previous = currentInfo.previousTradeDate && new Date(currentInfo.previousTradeDate + " 00:00 UTC").toISOString().slice(0,10);
  let nextRaw = record.nextOpen;
  if (previous === record.date) {
    const current = wall(currentInfo.openRaw);
    if (!currentInfo.isBusinessDay || current.date !== currentDate) throw new Error("Exchange is not open today");
    if (nextRaw && wall(nextRaw).at !== current.at) throw new Error("Recorded next open conflicts with exchange calendar");
    nextRaw = currentInfo.openRaw;
  }
  const next = wall(nextRaw);
  if (open.date !== record.date || close.date !== record.date || open.minutes !== 570 || close.minutes > 960
      || next.minutes !== 570 || close.at <= open.at || next.at <= close.at) throw new Error("Invalid exchange session order");
  for (const date of [record.date,next.date]) {
    const wd = (dayNumber(date)+4)%7;
    if (wd === 0 || wd === 6) throw new Error("Weekend cannot be a market session");
  }
  return {openedAt:open.at,closedAt:close.at,nextOpen:next.at};
}
export function validateQuoteSession(record, tickers) {
  dayNumber(record.date);
  if (!Array.isArray(record.gains) || record.gains.length !== tickers.length) throw new Error("Incomplete gain vector");
  const missing = [];
  for(let i=0;i<record.gains.length;i++) {
    const g=record.gains[i];
    if (g === null) missing.push(tickers[i].s);
    else if (!Number.isSafeInteger(g) || g < -1000000 || g > 0xffffffff) throw new Error(`Invalid gain for ${tickers[i].s}`);
  }
  if (missing.length) throw new Error(`Missing quotes for ${missing.length} listings: ${missing.slice(0,8).join(", ")}`);
}
