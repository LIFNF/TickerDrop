import type { Ticker } from "../lib/data";

export type Star = { id: number; x: number; y: number; r: number; top: boolean };

export type NodeId = "core" | "tickr" | "nft" | "clock" | "board" | "holder" | "mint";
export type ModId = "engine" | "cutoff" | "mint" | "book" | "vault";

export type Box = { id: NodeId; x: number; y: number; w: number; h: number; mod: ModId };

// world units are px at zoom 1
export const INNER = 360;
export const OUTER = 1350;

export const NODES: Box[] = [
  { id: "core", x: -170, y: -170, w: 340, h: 340, mod: "engine" },
  { id: "tickr", x: -2330, y: -700, w: 400, h: 250, mod: "engine" },
  { id: "nft", x: -2330, y: 200, w: 400, h: 250, mod: "book" },
  { id: "mint", x: -330, y: -2160, w: 660, h: 270, mod: "mint" },
  { id: "clock", x: 1350, y: -1640, w: 360, h: 290, mod: "engine" },
  { id: "board", x: 1880, y: -560, w: 460, h: 470, mod: "cutoff" },
  { id: "holder", x: 1900, y: 560, w: 420, h: 250, mod: "vault" },
];

export const node = (id: NodeId) => NODES.find((n) => n.id === id)!;
export const mid = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export type Link = { from: NodeId; to: NodeId; color: string; bend: number; flow: number; dash?: boolean; label?: string };

export const LINKS: Link[] = [
  { from: "tickr", to: "core", color: "#00f0ff", bend: -0.18, flow: 6, label: "3% · TICKR" },
  { from: "nft", to: "core", color: "#ff2bd6", bend: 0.18, flow: 6, label: "3% · ETH" },
  { from: "core", to: "board", color: "#ffd400", bend: -0.08, flow: 5 },
  { from: "board", to: "holder", color: "#ffd400", bend: 0.25, flow: 4 },
  { from: "clock", to: "board", color: "#ffd400", bend: 0.2, flow: 0, dash: true, label: "09:30 NY" },
  { from: "mint", to: "tickr", color: "#00f0ff", bend: 0.22, flow: 0, dash: true, label: "+100,000 TICKR / card" },
  { from: "holder", to: "core", color: "rgba(255,255,255,.5)", bend: 0.35, flow: 0, dash: true, label: "rollover" },
];

// seeded, so the sky is the same on every visit
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function sky(tickers: Ticker[]): Star[] {
  const n = tickers.length;
  if (!n) return [];
  const rand = rng(4663);
  const c = (OUTER - INNER) / Math.sqrt(n);
  const lo = Math.log10(Math.max(1, tickers[n - 1].cap));
  const hi = Math.log10(Math.max(10, tickers[0].cap));
  return tickers.map((t, i) => {
    const a = i * GOLDEN + (rand() - 0.5) * 0.12;
    const d = INNER + c * Math.sqrt(i + 0.5) + (rand() - 0.5) * 10;
    const k = (Math.log10(Math.max(1, t.cap)) - lo) / (hi - lo);
    const top = t.id <= 100;
    return { id: t.id, x: Math.cos(a) * d, y: Math.sin(a) * d, r: top ? 5 + k * 5 : 1.6 + k * 3.2, top };
  });
}

// coarse bucket grid for hit tests
export function index(stars: Star[], cell = 80) {
  const map = new Map<string, Star[]>();
  for (const s of stars) {
    const key = `${Math.floor(s.x / cell)},${Math.floor(s.y / cell)}`;
    let b = map.get(key);
    if (!b) map.set(key, (b = []));
    b.push(s);
  }
  return (x: number, y: number, radius: number) => {
    let best: Star | undefined;
    let bd = Infinity;
    const r = Math.ceil(radius / cell);
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        for (const s of map.get(`${cx + i},${cy + j}`) ?? []) {
          const d = Math.hypot(s.x - x, s.y - y) - s.r;
          if (d < radius && d < bd) {
            bd = d;
            best = s;
          }
        }
      }
    return best;
  };
}

export const WORLD = { x: -2450, y: -2300, w: 4900, h: 3900 };

export function bezier(a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { a, b, c: { x: mx - dy * bend, y: my + dx * bend } };
}

export function at(q: ReturnType<typeof bezier>, t: number) {
  const u = 1 - t;
  return {
    x: u * u * q.a.x + 2 * u * t * q.c.x + t * t * q.b.x,
    y: u * u * q.a.y + 2 * u * t * q.c.y + t * t * q.b.y,
  };
}
