export const FULL = 1_000_000; // 100% in contract units (0.0001%)

// "6.734%" -> 67340, anything flat/red/unparseable -> 0
export function gainUnits(s) {
  const v = parseFloat(String(s ?? "").replace(/[%,+\s]/g, ""));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(Math.round(v * 10_000), 0xffffffff);
}

/** screener rows -> gain units indexed by id - 1 (null where the listing didn't print) */
export function gainsById(rows, tickers) {
  const idOf = new Map(tickers.map((t) => [t.s, t.id]));
  const out = new Array(tickers.length).fill(null);
  for (const r of rows) {
    const id = idOf.get(String(r.symbol ?? "").trim().toUpperCase());
    if (!id || out[id - 1] !== null) continue;
    const raw = parseFloat(String(r.pctchange ?? "").replace(/[%,+\s]/g, ""));
    out[id - 1] = Number.isFinite(raw) ? Math.round(raw * 10_000) : null;
  }
  return out;
}

/**
 * The gainers GainPool will accept: gain desc / id asc, stopping at the one that fills 100%.
 */
export function buildRound(gains, tickers) {
  const movers = [];
  gains.forEach((g, i) => {
    if (g > 0) movers.push({ id: i + 1, s: tickers[i].s, g: Math.min(g, 0xffffffff) });
  });
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
