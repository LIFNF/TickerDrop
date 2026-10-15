import type { Ticker } from "../lib/data";
import { gainPct, type Pick } from "../lib/session";
import type { Camera } from "./camera";
import { drawCity } from "./city";
import { at, bezier, INNER, LINKS, mid, node, NODES, OUTER, type NodeId, type Star } from "./layout";

export type Focus = { kind: "node"; id: NodeId } | { kind: "tk"; id: number } | null;

export type Paint = {
  stars: Star[];
  tickers: Ticker[];
  bucket: Uint8Array;
  ring: Uint8Array; // 1 minted, 2 yours
  win: Map<number, Pick>;
  picks: Pick[];
  gains?: (number | null)[];
};

const Y = "#ffd400";
const M = "#ff2bd6";
const MONO = "JetBrains Mono, ui-monospace, monospace";

// 0 no print, 1-6 green by size, 7-12 red by size, 13 top-100 without data, 14 rest without data
export const FILLS = [
  "rgba(255,255,255,.22)",
  "rgba(255,212,0,.32)",
  "rgba(255,212,0,.45)",
  "rgba(255,212,0,.6)",
  "rgba(255,212,0,.78)",
  "rgba(255,212,0,.95)",
  "#ff7ae0",
  "rgba(0,240,255,.16)",
  "rgba(0,240,255,.22)",
  "rgba(0,240,255,.3)",
  "rgba(0,240,255,.4)",
  "rgba(0,240,255,.52)",
  "rgba(0,240,255,.66)",
  "rgba(255,212,0,.7)",
  "rgba(0,240,255,.32)",
];

const STEPS = [5000, 10000, 20000, 40000, 80000];

export function bucketOf(g: number | null | undefined, top: boolean) {
  if (g === undefined) return top ? 13 : 14;
  if (g === null) return 0;
  const a = Math.abs(g);
  let l = 0;
  while (l < STEPS.length && a > STEPS[l]) l++;
  return g > 0 ? 1 + l : 7 + l;
}

type Hl = { hover?: number; focus: Focus; t: number };

export function draw(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, p: Paint, hl: Hl) {
  const { k, x: ox, y: oy } = cam;
  const sx = (wx: number) => wx * k + ox;
  const sy = (wy: number) => wy * k + oy;
  const t = hl.t / 1000;

  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, w, h);
  drawCity(ctx, w, h, cam);

  grid(ctx, w, h, cam);

  // nebula
  const cx = sx(0);
  const cy = sy(0);
  const R = OUTER * 1.25 * k;
  let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, "rgba(255,212,0,.10)");
  g.addColorStop(0.3, "rgba(255,43,214,.07)");
  g.addColorStop(0.7, "rgba(0,240,255,.035)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // card glow: blue under TICKR, red under the book
  for (const [id, c] of [
    ["tickr", "0,170,255"],
    ["nft", "255,30,50"],
  ] as const) {
    const b = node(id);
    const m = mid(b);
    const gr = b.w * 0.75 * k * (1 + Math.sin(t * 1.6 + (id === "nft" ? 2 : 0)) * 0.04);
    g = ctx.createRadialGradient(sx(m.x), sy(m.y), 0, sx(m.x), sy(m.y), gr);
    g.addColorStop(0, `rgba(${c},.34)`);
    g.addColorStop(0.45, `rgba(${c},.12)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(sx(m.x) - gr, sy(m.y) - gr, gr * 2, gr * 2);
  }

  // orbit rails
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  for (const r of [INNER - 40, OUTER + 70]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.beginPath();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = (OUTER + 70) * k;
    const r1 = r0 + (i % 6 ? 4 : 10);
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  ctx.stroke();

  // node links
  for (const l of LINKS) {
    const q = bezier(mid(node(l.from)), mid(node(l.to)), l.bend);
    curve(ctx, q, cam, l.color, l.dash ? 0.45 : 0.3, l.dash);
    if (l.flow) particles(ctx, q, cam, l.color, l.flow, t, 1);
  }

  stars(ctx, w, h, cam, p, t);

  // payout lines: board -> winning stars
  if (p.picks.length) {
    const b = mid(node("board"));
    const top = p.picks.slice(0, 48);
    for (const pk of top) {
      const s = p.stars[pk.id - 1];
      if (!s) continue;
      const q = bezier(b, s, 0.12);
      curve(ctx, q, cam, Y, 0.18 + 0.5 * Math.min(1, pk.share * 2));
      particles(ctx, q, cam, Y, pk.share > 0.2 ? 3 : 1, t, 0.8 + pk.share);
    }
    for (const pk of top) {
      const s = p.stars[pk.id - 1];
      if (!s) continue;
      const r = Math.max(4, s.r * k) + 4 + Math.sin(t * 3 + pk.id) * 1.5;
      halo(ctx, sx(s.x), sy(s.y), r, pk.weight < pk.gain ? M : Y);
    }
  }

  // focus
  const f = hl.focus;
  if (f?.kind === "tk") {
    const s = p.stars[f.id - 1];
    if (s) {
      for (const n of [f.id - 1, f.id + 1]) {
        const o = p.stars[n - 1];
        if (o) curve(ctx, bezier(s, o, 0.2), cam, "rgba(255,255,255,.6)", 0.6, true);
      }
      if (p.win.has(f.id)) curve(ctx, bezier(mid(node("board")), s, 0.12), cam, Y, 1);
      const r = Math.max(6, s.r * k) + 8;
      ctx.strokeStyle = Y;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), r + 4 * Math.sin(t * 4) ** 2, 0, Math.PI * 2);
      ctx.stroke();
      crosshair(ctx, sx(s.x), sy(s.y), r + 14);
    }
  }
  if (hl.hover) {
    const s = p.stars[hl.hover - 1];
    if (s) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), Math.max(5, s.r * k) + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  labels(ctx, w, h, cam, p, f);

  // link captions
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "center";
  for (const l of LINKS) {
    if (!l.label) continue;
    const q = bezier(mid(node(l.from)), mid(node(l.to)), l.bend);
    // short hops get crowded by the pins
    if (Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) * k < 150) continue;
    const m = at(q, 0.5);
    tag(ctx, l.label, sx(m.x), sy(m.y), l.color);
  }
  ctx.textAlign = "left";
}

function grid(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera) {
  let step = 100;
  while (step * cam.k < 28) step *= 5;
  while (step * cam.k > 140) step /= 5;
  const px = step * cam.k;
  const x0 = (((cam.x % px) + px) % px) - px;
  const y0 = (((cam.y % px) + px) % px) - px;
  const major = Math.round(5 * px);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x < w + px; x += px) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  for (let y = y0; y < h + px; y += px) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  }
  ctx.strokeStyle = "rgba(255,255,255,.035)";
  ctx.stroke();
  // crosses on major intersections
  const mx0 = (((cam.x % major) + major) % major) - major;
  const my0 = (((cam.y % major) + major) % major) - major;
  ctx.beginPath();
  for (let x = mx0; x < w + major; x += major)
    for (let y = my0; y < h + major; y += major) {
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
    }
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.stroke();
}

function stars(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, p: Paint, t: number) {
  const { k, x: ox, y: oy } = cam;
  const paths: Path2D[] = FILLS.map(() => new Path2D());
  const rings = [new Path2D(), new Path2D()];
  for (let i = 0; i < p.stars.length; i++) {
    const s = p.stars[i];
    const x = s.x * k + ox;
    const y = s.y * k + oy;
    const r = Math.max(0.9, s.r * k);
    if (x < -r || y < -r || x > w + r || y > h + r) continue;
    const path = paths[p.bucket[i]];
    if (r < 1.6) path.rect(x - r, y - r, r * 2, r * 2);
    else {
      path.moveTo(x + r, y);
      path.arc(x, y, r, 0, Math.PI * 2);
    }
    if (p.ring[i]) {
      const ring = rings[p.ring[i] - 1];
      ring.moveTo(x + r + 2.5, y);
      ring.arc(x, y, r + 2.5, 0, Math.PI * 2);
    }
  }
  for (let b = 0; b < FILLS.length; b++) {
    ctx.globalAlpha = b >= 4 && b <= 6 ? 0.85 + 0.15 * Math.sin(t * 2.2 + b) : 1;
    ctx.fillStyle = FILLS[b];
    ctx.fill(paths[b]);
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.stroke(rings[0]);
  ctx.strokeStyle = "#39ff88";
  ctx.lineWidth = 1.5;
  ctx.stroke(rings[1]);
}

function labels(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, p: Paint, f: Focus) {
  const { k, x: ox, y: oy } = cam;
  if (k < 0.32) return;
  const all = k > 1.15;
  ctx.font = `${k > 2 ? 12 : 11}px ${MONO}`;
  ctx.textBaseline = "middle";
  for (let i = 0; i < p.stars.length; i++) {
    const s = p.stars[i];
    const win = p.win.get(s.id);
    const lit = win || (f?.kind === "tk" && f.id === s.id);
    if (!all && !lit && !(s.top && k > 0.55)) continue;
    const x = s.x * k + ox;
    const y = s.y * k + oy;
    if (x < -60 || y < -20 || x > w + 20 || y > h + 20) continue;
    const r = Math.max(1, s.r * k);
    const sym = p.tickers[i]?.s ?? "";
    ctx.fillStyle = lit ? Y : s.top ? "rgba(255,212,0,.8)" : "rgba(232,233,240,.55)";
    ctx.fillText(sym, x + r + 5, y);
    if (win && k > 0.45) {
      ctx.fillStyle = win.weight < win.gain ? M : Y;
      ctx.fillText(gainPct(win.gain, 1), x + r + 5 + ctx.measureText(sym).width + 6, y);
    } else if (k > 2.2 && p.gains) {
      const g = p.gains[i];
      if (g !== null && g !== undefined) {
        ctx.fillStyle = g > 0 ? "rgba(255,212,0,.7)" : "rgba(0,240,255,.6)";
        ctx.fillText(gainPct(g, 2), x + r + 5 + ctx.measureText(sym).width + 6, y);
      }
    }
  }
  ctx.textBaseline = "alphabetic";
}

type Q = ReturnType<typeof bezier>;

function curve(ctx: CanvasRenderingContext2D, q: Q, cam: Camera, color: string, alpha: number, dash?: boolean) {
  const { k, x, y } = cam;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = dash ? 1 : 1.4;
  if (dash) ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(q.a.x * k + x, q.a.y * k + y);
  ctx.quadraticCurveTo(q.c.x * k + x, q.c.y * k + y, q.b.x * k + x, q.b.y * k + y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function particles(ctx: CanvasRenderingContext2D, q: Q, cam: Camera, color: string, n: number, t: number, speed: number) {
  const len = Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) || 1;
  const v = (260 * speed) / len;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = color;
  for (let j = 0; j < n; j++) {
    const u = (t * v + j / n) % 1;
    const p = at(q, u);
    const x = p.x * cam.k + cam.x;
    const y = p.y * cam.k + cam.y;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, color === Y ? "rgba(255,212,0,.45)" : "rgba(255,43,214,.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function crosshair(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.strokeStyle = "rgba(255,212,0,.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.moveTo(x + dx * r, y + dy * r);
    ctx.lineTo(x + dx * (r + 10), y + dy * (r + 10));
  }
  ctx.stroke();
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = "rgba(5,6,10,.85)";
  ctx.fillRect(x - w / 2, y - 9, w, 18);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(x - w / 2 + 0.5, y - 8.5, w - 1, 17);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 4);
}

// whole-world thumbnail for the minimap; drawn once per data change
export function thumb(cv: HTMLCanvasElement, p: Paint, world: { x: number; y: number; w: number; h: number }) {
  const ctx = cv.getContext("2d")!;
  const s = cv.width / world.w;
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < p.stars.length; i++) {
    const st = p.stars[i];
    ctx.fillStyle = FILLS[p.bucket[i]];
    ctx.fillRect((st.x - world.x) * s, (st.y - world.y) * s, 1.2, 1.2);
  }
  for (const n of NODES) {
    ctx.strokeStyle = n.id === "core" ? Y : "rgba(255,255,255,.5)";
    ctx.strokeRect((n.x - world.x) * s + 0.5, (n.y - world.y) * s + 0.5, n.w * s, n.h * s);
  }
  for (const pk of p.picks.slice(0, 48)) {
    const st = p.stars[pk.id - 1];
    if (!st) continue;
    ctx.fillStyle = Y;
    ctx.fillRect((st.x - world.x) * s - 1, (st.y - world.y) * s - 1, 3, 3);
  }
}
