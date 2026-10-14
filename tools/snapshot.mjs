// Builds the fixed ticker table: Nasdaq-listed equities ranked by market cap.
// node tools/snapshot.mjs [raw.json]   (raw = nasdaq screener download, optional)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&exchange=nasdaq&download=true";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// not equity, or equity that trades like a derivative
const SKIP = [
  /warrants?\b/i,
  /\brights?\b/i,
  /\bunits?$/i,
  /\bunit$/i,
  /\bnotes?\b/i,
  /debentures?/i,
  /preferred/i,
  /depositary shares? each represent\w* (a )?1\/\d+/i,
  /cumulative/i,
  /\bbaby bonds?\b/i,
  /fixed[- ]to[- ]floating/i,
];

async function load() {
  const file = process.argv[2];
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const res = await fetch(SRC, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`screener ${res.status}`);
  return res.json();
}

const raw = await load();
const rows = raw.data.rows
  .map((r) => ({ s: r.symbol.trim().toUpperCase(), n: r.name.trim(), cap: Math.round(parseFloat(r.marketCap) || 0) }))
  .filter((r) => r.cap > 0 && /^[A-Z]{1,5}$/.test(r.s) && !SKIP.some((re) => re.test(r.n)))
  .sort((a, b) => b.cap - a.cap || (a.s < b.s ? -1 : 1));

const seen = new Set();
const list = rows.filter((r) => (seen.has(r.s) ? false : seen.add(r.s)));

const packed = "0x" + list.map((r) => Buffer.from(r.s.padEnd(5, "\0")).toString("hex")).join("");

mkdirSync("data", { recursive: true });
mkdirSync("web/public", { recursive: true });

writeFileSync("data/tickers.json", JSON.stringify(list.map((r, i) => ({ id: i + 1, ...r })), null, 0));
writeFileSync("data/tickers.hex", packed);
// web only needs symbol + name + cap; keep it lean
writeFileSync("web/public/tickers.json", JSON.stringify(list.map((r) => [r.s, r.n.replace(/\s+(Common Stock|Class A Common Stock|Ordinary Shares|American Depositary Shares)\b.*$/i, ""), r.cap])));

console.log(`${list.length} tickers, ${(packed.length - 2) / 2} bytes`);
console.log("top:", list.slice(0, 10).map((r) => r.s).join(" "));
console.log("#100:", list[99].s, "#101:", list[100].s);
