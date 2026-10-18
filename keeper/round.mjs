export const FULL = 1_000_000; // 100% in contract units (0.0001%)

// "6.734%" -> 67340, anything flat/red/unparseable -> 0
export function gainUnits(s) {
  const text=String(s??"").trim().replace(/%$/,"");
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return 0;
  const units=Math.round(Number(text)*10_000);
  return Number.isSafeInteger(units)&&units>0&&units<=0xffffffff?units:0;
}

/** screener rows -> gain units indexed by id - 1 (null where the listing didn't print) */
export function gainsById(rows, tickers) {
  const idOf = new Map(tickers.map((t) => [t.s, t.id]));
  const out = new Array(tickers.length).fill(null);
  const seen = new Set();
  for (const r of rows) {
    const id = idOf.get(String(r.symbol ?? "").trim().toUpperCase());
    if (!id) continue;
    if(seen.has(id))throw new Error("Duplicate listing quote");
    seen.add(id);
    const text = String(r.pctchange ?? "").trim().replace(/%$/, "");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) continue;
    const units = Math.round(Number(text) * 10_000);
    out[id - 1] = Number.isSafeInteger(units) && units >= -1_000_000 && units <= 0xffffffff ? units : null;
  }
  return out;
}

/**
 * The gainers GainPool will accept: gain desc / id asc, stopping at the one that fills 100%.
 */
export function buildRound(gains, tickers) {
  if (!Array.isArray(gains) || gains.length !== tickers.length) throw new Error("Gain vector length mismatch");
  const movers = [];
  for(let i=0;i<gains.length;i++) {
    const g=gains[i];
    if (!Number.isSafeInteger(g) || g < -1_000_000 || g > 0xffffffff) throw new Error("Invalid gain units");
    if (g > 0) movers.push({ id: i + 1, s: tickers[i].s, g });
  }
  movers.sort((a, b) => b.g - a.g || a.id - b.id);

  const picked = [];
  let weight = 0;
  for (const m of movers) {
    if (weight >= FULL) break;
    picked.push(m);
    weight += Math.min(m.g, FULL - weight);
  }
  return { picked, positive: movers.length, weight };
}

// Closing/last-sale prices from the same Nasdaq snapshot, in USD.
// Missing or invalid quotes stay null; never substitute zero or another listing.
export function pricesById(rows, tickers) {
  const idOf = new Map(tickers.map(t => [t.s, t.id]));
  const out = new Array(tickers.length).fill(null);
  const seen = new Set();
  for (const row of rows) {
    const id = idOf.get(String(row.symbol ?? "").trim().toUpperCase());
    if (!id) continue;
    if(seen.has(id))throw new Error("Duplicate listing quote");
    seen.add(id);
    const formatted=String(row.lastsale??"").trim();
    if(!/^\$?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(formatted))continue;
    const raw = formatted.replace(/[$,]/g, "");
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) continue;
    const price = Number(raw);
    if (Number.isFinite(price) && price > 0) out[id - 1] = price;
  }
  return out;
}
