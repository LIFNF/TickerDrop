export const FULL = 1_000_000; // 100% in contract units (0.0001%)

// "6.734%" -> 67340
export function gainUnits(s) {
  const v = parseFloat(String(s ?? "").replace(/[%,+\s]/g, ""));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(Math.round(v * 10_000), 0xffffffff);
}

/**
 * rows: screener rows ({ symbol, pctchange })
 * tickers: [{ id, s }] in id order
 * Returns the gainers GainPool will accept: by gain desc / id asc, stopping at the one that fills 100%.
 */
export function buildRound(rows, tickers) {
  const idOf = new Map(tickers.map((t) => [t.s, t.id]));
  const seen = new Set();
  const movers = [];
  for (const r of rows) {
    const id = idOf.get(String(r.symbol ?? "").trim().toUpperCase());
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const g = gainUnits(r.pctchange);
    if (g > 0) movers.push({ id, s: tickers[id - 1].s, g });
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
