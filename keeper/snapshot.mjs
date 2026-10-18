// Records the session's final % change per slot, right after the 16:00 close.
// Output: data/sessions/YYYY-MM-DD.json, settled at the next open by settle.mjs.

import { existsSync, mkdirSync } from "node:fs";
import {readSnapshot,writeSnapshot} from "./storage.mjs";
import { gainsById, pricesById } from "./round.mjs";
import { validateQuoteSession, sessionSchedule } from "./calendar.mjs";
import {safeError} from "./safe-error.mjs";
import { isoOf, log, nasdaq, nyNow, sessionsDir, tickers } from "./lib.mjs";

async function main() {
  const now = nyNow();
  const file = new URL(`${now.date}.json`, sessionsDir);
  if (existsSync(file)){readSnapshot(file,now.date,tickers);return log(`${now.date} already recorded and validated`);}

  const info = await nasdaq("market-info");
  const closeDate = info.closeRaw?.slice(0, 10);
  const [ch, cm] = (info.closeRaw?.slice(11, 16) || "16:00").split(":").map(Number);
  if (!info.isBusinessDay || closeDate !== now.date) return log(`no session on ${now.date}`);
  if (now.minutes < ch * 60 + cm + 3) return log(`${now.date} still trading`);
  if (now.minutes > 19 * 60 + 30) throw new Error(`${now.date}: too late, after-hours prints may have leaked in`);

  // the screener must be showing today's close, not yesterday's
  const probe = await nasdaq("quote/AAPL/info?assetclass=stocks");
  const stamp = probe.primaryData?.lastTradeTimestamp || "";
  const want = new Date(now.date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  if (!stamp.startsWith(want)) throw new Error(`stale quotes: "${stamp}" vs ${want}`);

  const screen = await nasdaq("screener/stocks?tableonly=true&limit=10000&offset=0&exchange=nasdaq&download=true");
  const rows = screen.rows || [];
  if (rows.length < 2000) throw new Error(`screener returned ${rows.length} rows`);

  const gains = gainsById(rows, tickers);
  const prices = pricesById(rows, tickers);
  const printed = gains.filter((g) => g !== null).length;
  validateQuoteSession({date:now.date,gains},tickers);
  const nextOpen = `${isoOf(info.nextTradeDate)}T09:30:00`;
  sessionSchedule({date:now.date,open:info.openRaw,close:info.closeRaw,nextOpen},{},now.date);

  mkdirSync(sessionsDir, { recursive: true });
  writeSnapshot(file,{ date: now.date, open: info.openRaw, close: info.closeRaw, nextOpen, takenAt: new Date().toISOString(), probe: stamp, source: "Nasdaq screener API", status:"provisional", prices, gains },tickers);
  log(`${now.date} recorded, ${printed} slots, ${gains.filter((g) => g > 0).length} green`);
}

main().catch((e) => {
  console.error(safeError(e));
  process.exit(1);
});
