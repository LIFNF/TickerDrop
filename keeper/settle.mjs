// Posts the session's gainers to GainPool once the Nasdaq close is in.
//
//   REPORTER_KEY  private key of the reporter set on GainPool
//   RPC_URL       optional, defaults to the public Robinhood Chain endpoint
//   DRY=1         build and print the round without sending
//
// Safe to run any number of times a day: it exits unless today's session is closed
// and not settled yet.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createPublicClient, createWalletClient, http, defineChain, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildRound } from "./round.mjs";

const root = new URL("../", import.meta.url);
const tickers = JSON.parse(readFileSync(new URL("data/tickers.json", root)));
const deployed = JSON.parse(readFileSync(new URL("web/src/chain/deployed.json", root)));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const NY = "America/New_York";

const chain = defineChain({
  id: deployed.chainId || 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] } },
});

const abi = parseAbi([
  "function lastDay() view returns (uint32)",
  "function settleableAt(uint32) view returns (uint256)",
  "function settle(uint32 day, uint16[] ids, uint32[] gains)",
]);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nasdaq(path, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch("https://api.nasdaq.com/api/" + path, {
        headers: { "user-agent": UA, accept: "application/json, text/plain, */*", origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body.data) throw new Error("empty body");
      return body.data;
    } catch (e) {
      if (i >= tries) throw new Error(`${path}: ${e.message}`);
      await sleep(5000 * i);
    }
  }
}

function nyNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

async function main() {
  if (!deployed.pool || /^0x0+$/.test(deployed.pool)) return log("not deployed yet");

  const now = nyNow();
  const info = await nasdaq("market-info");
  const closeAt = info.closeRaw?.slice(0, 10);
  const [ch, cm] = (info.closeRaw?.slice(11, 16) || "16:00").split(":").map(Number);

  if (!info.isBusinessDay || closeAt !== now.date) return log(`no session on ${now.date}`);
  if (now.minutes < ch * 60 + cm + 3) return log(`session ${now.date} still open`);

  const day = Date.UTC(+now.date.slice(0, 4), +now.date.slice(5, 7) - 1, +now.date.slice(8, 10)) / 86_400_000;

  const pub = createPublicClient({ chain, transport: http() });
  const lastDay = await pub.readContract({ address: deployed.pool, abi, functionName: "lastDay" });
  if (lastDay >= day) return log(`session ${now.date} already settled`);
  const at = Number(await pub.readContract({ address: deployed.pool, abi, functionName: "settleableAt", args: [day] }));
  if (at === 0) return log(`session ${now.date} not eligible (before launch)`);

  // make sure the screener is showing today's close, not yesterday's
  const probe = await nasdaq("quote/AAPL/info?assetclass=stocks");
  const stamp = probe.primaryData?.lastTradeTimestamp || "";
  const [y, m, d] = now.date.split("-").map(Number);
  const want = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  if (!stamp.startsWith(want)) throw new Error(`stale quotes: "${stamp}" vs ${want}`);

  const screen = await nasdaq("screener/stocks?tableonly=true&limit=10000&offset=0&exchange=nasdaq&download=true");
  const rows = screen.rows || [];
  if (rows.length < 2000) throw new Error(`screener returned ${rows.length} rows`);

  const { picked, positive, weight } = buildRound(rows, tickers);
  log(`${now.date} day=${day} positive=${positive} paying=${picked.length} weight=${(weight / 1e4).toFixed(4)}%`);
  for (const p of picked) log(`  #${p.id} ${p.s.padEnd(5)} +${(p.g / 1e4).toFixed(4)}%`);

  mkdirSync(new URL("out/", root), { recursive: true });
  writeFileSync(
    new URL(`out/round-${now.date}.json`, root),
    JSON.stringify({ date: now.date, day, positive, weight, picked, source: rows.map((r) => [r.symbol, r.pctchange, r.lastsale]) }),
  );

  if (process.env.DRY === "1") return log("dry run, not sending");
  const key = process.env.REPORTER_KEY;
  if (!key) throw new Error("REPORTER_KEY missing");

  const wait = at * 1000 - Date.now() + 15_000;
  if (wait > 0) {
    log(`chain opens this session at ${new Date(at * 1000).toISOString()}, waiting ${Math.ceil(wait / 60000)}m`);
    await sleep(wait);
  }

  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  const wallet = createWalletClient({ account, chain, transport: http() });
  const args = [day, picked.map((p) => p.id), picked.map((p) => p.g)];

  const { request } = await pub.simulateContract({ account, address: deployed.pool, abi, functionName: "settle", args });
  const hash = await wallet.writeContract(request);
  log("tx", hash);
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error("settle reverted");
  log(`settled in block ${rc.blockNumber}, gas ${rc.gasUsed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
