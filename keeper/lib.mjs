import { readFileSync } from "node:fs";
import { createPublicClient, defineChain, http, parseAbi } from "viem";

export const root = new URL("../", import.meta.url);
export const tickers = JSON.parse(readFileSync(new URL("data/tickers.json", root)));
export const deployed = JSON.parse(readFileSync(new URL("web/src/chain/deployed.json", root)));
export const sessionsDir = new URL("data/sessions/", root);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const chain = defineChain({
  id: deployed.chainId || 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] } },
});

export const pub = createPublicClient({ chain, transport: http() });

export const poolAbi = parseAbi([
  "function lastDay() view returns (uint32)",
  "function settleableAt(uint32) view returns (uint256)",
  "function settle(uint32 day, uint16[] ids, uint32[] gains)",
]);

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function nasdaq(path, tries = 4) {
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

export function nyNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

// "2026-10-14" <-> days since epoch
export const dayOf = (date) => Date.parse(date + "T00:00:00Z") / 86_400_000;
export const dateOf = (day) => new Date(day * 86_400_000).toISOString().slice(0, 10);

// "Oct 13, 2026" -> "2026-10-13"
export const isoOf = (s) => dateOf(Date.parse(s + " 00:00 UTC") / 86_400_000);

export const isLive = () => deployed.pool && !/^0x0+$/.test(deployed.pool);
