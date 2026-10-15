import type { Camera } from "./camera";

// screen-space backdrop: three parallax slabs baked once per resize, neon drawn live

type Sign = { x: number; y: number; w: number; h: number; text: string; color: string; layer: number; phase: number };
type Box = { x: number; y: number; w: number; h: number };

export type City = {
  w: number;
  h: number;
  m: number;
  layers: HTMLCanvasElement[];
  signs: Sign[];
  board: Box;
  arcade: Box;
  rain: Float32Array;
};

const PAR = [0.02, 0.05, 0.1];
const NEON = ["#ff2bd6", "#00f0ff", "#ffd400", "#ff2a3c"];
const WORDS = ["株", "TICKR", "夜市", "電脳", "09:30", "24H", "OPEN", "取引"];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function slab(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

function windows(g: CanvasRenderingContext2D, r: () => number, x: number, top: number, bw: number, bottom: number, step: number, odds: number, glow: number) {
  for (let y = top + 6; y < bottom - 4; y += step)
    for (let wx = x + 4; wx < x + bw - 4; wx += step * 0.9) {
      if (r() > odds) continue;
      const k = r();
      g.fillStyle =
        k < 0.5 ? `rgba(255,212,120,${glow})` : k < 0.75 ? `rgba(0,240,255,${glow * 0.9})` : k < 0.9 ? `rgba(255,43,214,${glow * 0.8})` : `rgba(255,255,255,${glow * 0.6})`;
      g.fillRect(wx, y, step * 0.42, step * 0.3);
    }
}

function person(g: CanvasRenderingContext2D, x: number, foot: number, s: number, kind: "visor" | "umbrella" | "player") {
  g.fillStyle = "#020205";
  g.beginPath();
  // coat
  g.moveTo(x - s * 0.17, foot);
  g.lineTo(x - s * 0.2, foot - s * 0.55);
  g.quadraticCurveTo(x - s * 0.18, foot - s * 0.8, x, foot - s * 0.82);
  g.quadraticCurveTo(x + s * 0.18, foot - s * 0.8, x + s * 0.2, foot - s * 0.55);
  g.lineTo(x + s * 0.17, foot);
  g.closePath();
  g.fill();
  // head + hood
  g.beginPath();
  g.arc(x, foot - s * 0.9, s * 0.1, 0, Math.PI * 2);
  g.fill();
  g.lineCap = "round";
  if (kind === "visor") {
    g.strokeStyle = "#00f0ff";
    g.lineWidth = Math.max(1.5, s * 0.035);
    g.shadowColor = "#00f0ff";
    g.shadowBlur = s * 0.4;
    g.beginPath();
    g.moveTo(x - s * 0.08, foot - s * 0.92);
    g.lineTo(x + s * 0.1, foot - s * 0.91);
    g.stroke();
    g.shadowBlur = 0;
  }
  if (kind === "umbrella") {
    g.beginPath();
    g.ellipse(x + s * 0.05, foot - s * 1.08, s * 0.42, s * 0.22, 0, Math.PI, 0);
    g.fill();
    g.strokeStyle = "#ff2a3c";
    g.lineWidth = Math.max(1.2, s * 0.03);
    g.shadowColor = "#ff2a3c";
    g.shadowBlur = s * 0.5;
    g.beginPath();
    g.ellipse(x + s * 0.05, foot - s * 1.08, s * 0.42, s * 0.22, 0, Math.PI, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(x + s * 0.05, foot - s * 1.08);
    g.lineTo(x + s * 0.05, foot - s * 0.62);
    g.stroke();
    g.shadowBlur = 0;
  }
  if (kind === "player") {
    // arm out to the stick, rim lit by the screen
    g.strokeStyle = "#020205";
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.moveTo(x + s * 0.12, foot - s * 0.62);
    g.lineTo(x + s * 0.34, foot - s * 0.5);
    g.stroke();
    g.strokeStyle = "rgba(255,43,214,.75)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x + s * 0.2, foot - s * 0.55);
    g.quadraticCurveTo(x + s * 0.18, foot - s * 0.8, x + s * 0.02, foot - s * 0.82);
    g.arc(x, foot - s * 0.9, s * 0.1, 0.4, -1.2, true);
    g.stroke();
  }
}

export function buildCity(w: number, h: number): City {
  const r = rng(909);
  const m = Math.max(80, Math.round(w * 0.2));
  const LW = w + m * 2;
  const LH = h + 40;
  const unit = Math.min(1, h / 900, 0.45 + w / 1400);
  const signs: Sign[] = [];

  // far ridge
  const far = slab(LW, LH);
  let g = far.getContext("2d")!;
  const fb = h * 0.84;
  for (let x = 0; x < LW; ) {
    const bw = (14 + r() * 50) * unit;
    let bh = h * (0.04 + r() * 0.15);
    const tower = r() < 0.08;
    if (tower) bh *= 1.8;
    g.fillStyle = "#100e22";
    g.fillRect(x, fb - bh, bw, LH - fb + bh);
    if (tower) {
      g.fillRect(x + bw / 2 - 1, fb - bh - 26 * unit, 2, 26 * unit);
      g.fillStyle = "rgba(255,42,60,.9)";
      g.fillRect(x + bw / 2 - 1.5, fb - bh - 28 * unit, 3, 3);
    }
    windows(g, r, x, fb - bh, bw, LH, 5 * unit + 3, 0.09, 0.35);
    x += bw + r() * 4;
  }
  g.globalCompositeOperation = "source-atop";
  let fog = g.createLinearGradient(0, h * 0.55, 0, LH);
  fog.addColorStop(0, "rgba(40,20,80,0)");
  fog.addColorStop(1, "rgba(70,24,110,.55)");
  g.fillStyle = fog;
  g.fillRect(0, 0, LW, LH);

  // mid blocks
  const mid = slab(LW, LH);
  g = mid.getContext("2d")!;
  const mb = h * 0.92;
  let placedBoard: Box | null = null;
  for (let x = 0; x < LW; ) {
    const bw = (34 + r() * 92) * unit;
    const bh = h * (0.06 + r() * 0.22);
    const top = mb - bh;
    const grad = g.createLinearGradient(0, top, 0, LH);
    grad.addColorStop(0, "#0c0b18");
    grad.addColorStop(1, "#050409");
    g.fillStyle = grad;
    g.fillRect(x, top, bw, LH - top);
    g.fillStyle = r() < 0.5 ? "rgba(0,240,255,.22)" : "rgba(255,43,214,.2)";
    g.fillRect(r() < 0.5 ? x : x + bw - 1, top, 1, LH - top);
    if (r() < 0.25) {
      g.fillStyle = "rgba(0,240,255,.16)";
      for (let y = top + 10; y < LH; y += 9 * unit + 5) g.fillRect(x + 3, y, bw - 6, 1);
    } else windows(g, r, x, top, bw, LH, 7 * unit + 3, 0.13, 0.5);

    const cx = x + bw / 2;
    if (!placedBoard && bw > 64 * unit && cx > m + w * 0.74 && cx < m + w * 0.86 && bh > h * 0.12) {
      placedBoard = { x: x + 8, y: top + 14, w: Math.min(bw - 16, 120 * unit), h: 66 * unit };
    } else if (bw > 52 * unit && bh > h * 0.12 && r() < 0.5 && signs.length < Math.min(7, LW / 240)) {
      const sh = (64 + r() * 60) * unit;
      signs.push({
        x: r() < 0.5 ? x - 6 : x + bw - 16,
        y: top + 10 + r() * Math.max(4, bh * 0.3),
        w: 22 * unit,
        h: sh,
        text: WORDS[signs.length % WORDS.length],
        color: NEON[Math.floor(r() * NEON.length)],
        layer: 1,
        phase: r() * 10,
      });
    }
    x += bw + r() * 10;
  }
  fog = g.createLinearGradient(0, h * 0.7, 0, LH);
  fog.addColorStop(0, "rgba(10,6,24,0)");
  fog.addColorStop(1, "rgba(16,8,30,.7)");
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = fog;
  g.fillRect(0, 0, LW, LH);
  g.globalCompositeOperation = "source-over";

  // near: framing towers, street, people, the arcade
  const near = slab(LW, LH);
  g = near.getContext("2d")!;
  const street = h * 0.965;
  g.fillStyle = "#040308";
  g.fillRect(0, street, LW, LH - street);
  g.strokeStyle = "rgba(255,43,214,.12)";
  g.lineWidth = 1;
  const vx = m + w / 2;
  g.beginPath();
  for (let i = -12; i <= 12; i++) {
    g.moveTo(vx + i * 14, street);
    g.lineTo(vx + i * 160, LH);
  }
  g.moveTo(0, street + 0.5);
  g.lineTo(LW, street + 0.5);
  g.stroke();
  // wet glow on the asphalt
  for (const [x, c] of [
    [m + w * 0.2, "rgba(0,240,255,.10)"],
    [m + w * 0.62, "rgba(255,43,214,.12)"],
    [m + w * 0.84, "rgba(255,42,60,.10)"],
  ] as const) {
    const gg = g.createRadialGradient(x, street + 10, 0, x, street + 10, 160 * unit);
    gg.addColorStop(0, c);
    gg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gg;
    g.fillRect(x - 160 * unit, street - 40, 320 * unit, 80);
  }

  const lw = m + w * 0.12;
  const ltop = h * 0.6;
  g.fillStyle = "#030206";
  g.fillRect(0, ltop, lw, LH - ltop);
  g.fillRect(lw - 30 * unit, ltop - 6, 36 * unit, 6);
  g.strokeStyle = "rgba(0,240,255,.35)";
  g.beginPath();
  g.moveTo(lw + 0.5, ltop - 6);
  g.lineTo(lw + 0.5, LH);
  g.stroke();
  // rail on the roof
  g.strokeStyle = "rgba(255,255,255,.14)";
  g.beginPath();
  for (let x = m * 0.4; x < lw; x += 10 * unit) {
    g.moveTo(x, ltop);
    g.lineTo(x, ltop - 12 * unit);
  }
  g.moveTo(m * 0.4, ltop - 12 * unit);
  g.lineTo(lw, ltop - 12 * unit);
  g.stroke();
  windows(g, r, 0, ltop + 20, lw - 6, LH, 9 * unit + 4, 0.08, 0.35);
  const ps = 54 * unit;
  person(g, lw - 70 * unit, ltop, ps, "visor");
  person(g, lw - 130 * unit, ltop, ps * 0.92, "umbrella");

  const rx = m + w * 0.9;
  const rtop = h * 0.66;
  g.fillStyle = "#030206";
  g.fillRect(rx, rtop, LW - rx, LH - rtop);
  // water tank + dish
  g.fillRect(rx + 30 * unit, rtop - 34 * unit, 34 * unit, 34 * unit);
  g.beginPath();
  g.ellipse(rx + 47 * unit, rtop - 34 * unit, 17 * unit, 6 * unit, 0, Math.PI, 0);
  g.fill();
  g.beginPath();
  g.arc(rx + 100 * unit, rtop - 8 * unit, 16 * unit, Math.PI * 1.1, Math.PI * 1.9);
  g.fill();
  g.strokeStyle = "rgba(255,43,214,.35)";
  g.beginPath();
  g.moveTo(rx - 0.5, rtop);
  g.lineTo(rx - 0.5, LH);
  g.stroke();
  windows(g, r, rx + 6, rtop + 16, LW - rx - 6, LH, 9 * unit + 4, 0.08, 0.35);

  const ah = 100 * unit;
  const arcade = { x: m + w * 0.68, y: street - ah, w: ah * 0.48, h: ah };
  g.fillStyle = "#07060c";
  g.beginPath();
  const a = arcade;
  g.moveTo(a.x, a.y + a.h);
  g.lineTo(a.x, a.y);
  g.lineTo(a.x + a.w, a.y);
  g.lineTo(a.x + a.w, a.y + a.h * 0.22);
  g.lineTo(a.x + a.w * 0.82, a.y + a.h * 0.5);
  g.lineTo(a.x + a.w * 1.12, a.y + a.h * 0.58);
  g.lineTo(a.x + a.w * 1.02, a.y + a.h * 0.64);
  g.lineTo(a.x + a.w, a.y + a.h);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,43,214,.5)";
  g.stroke();
  person(g, a.x - ah * 0.34, street, ah * 0.86, "player");

  return {
    w,
    h,
    m,
    layers: [far, mid, near],
    signs,
    board: placedBoard ?? { x: m + w * 0.78, y: h * 0.74, w: 110 * unit, h: 60 * unit },
    arcade,
    rain: Float32Array.from({ length: Math.round(w / 9) * 3 }, () => r()),
  };
}

const INVADER = ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"];
const INVADER2 = ["00100000100", "10010001001", "10111111101", "11101110111", "11111111111", "01111111110", "00100000100", "01000000010"];

function neonRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, on: number) {
  ctx.globalAlpha = 0.25 * on;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = on;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

export function drawCity(ctx: CanvasRenderingContext2D, city: City, cam: Camera, t: number) {
  const { w, h, m } = city;
  const fade = Math.max(0.28, Math.min(1, 1.18 - cam.k * 0.38));

  // sky wash so the void reads as night, not black
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "rgba(5,6,10,0)");
  sky.addColorStop(0.5, `rgba(18,10,40,${0.55 * fade})`);
  sky.addColorStop(0.82, `rgba(70,18,90,${0.5 * fade})`);
  sky.addColorStop(1, `rgba(20,8,30,${0.6 * fade})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const hz = ctx.createRadialGradient(w * 0.55, h * 0.86, 0, w * 0.55, h * 0.86, w * 0.6);
  hz.addColorStop(0, `rgba(255,43,214,${0.16 * fade})`);
  hz.addColorStop(0.5, `rgba(0,240,255,${0.05 * fade})`);
  hz.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hz;
  ctx.fillRect(0, h * 0.4, w, h * 0.6);

  const c = cam.toWorld(w / 2, h / 2);
  const off = PAR.map((p) => ({
    x: Math.max(-m, Math.min(m, -c.x * p)),
    y: Math.max(-30, Math.min(30, -c.y * p * 0.4)),
  }));

  // flying cars between the far and mid slabs
  ctx.globalAlpha = fade;
  ctx.drawImage(city.layers[0], -m + off[0].x, off[0].y, w + 2 * m, h + 40);
  for (let i = 0; i < 4; i++) {
    const dir = i % 2 ? -1 : 1;
    const span = w + 400;
    const u = ((t / 1000) * (60 + i * 25) + i * 377) % span;
    const x = dir > 0 ? u - 200 : w + 200 - u;
    const y = h * (0.42 + i * 0.09) + Math.sin(t / 900 + i) * 6;
    const tr = ctx.createLinearGradient(x, 0, x - dir * 90, 0);
    tr.addColorStop(0, i % 2 ? "rgba(255,42,60,.55)" : "rgba(0,240,255,.5)");
    tr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = tr;
    ctx.fillRect(Math.min(x, x - dir * 90), y - 0.75, 90, 1.5);
    ctx.fillStyle = "#06060b";
    ctx.fillRect(x - 7, y - 3, 14, 5);
    ctx.fillStyle = "#fff";
    ctx.fillRect(dir > 0 ? x + 6 : x - 8, y - 1, 2, 2);
    ctx.fillStyle = "#ff2a3c";
    ctx.fillRect(dir > 0 ? x - 8 : x + 6, y - 1, 2, 2);
  }

  ctx.drawImage(city.layers[1], -m + off[1].x, off[1].y, w + 2 * m, h + 40);

  // neon on the mid slab
  const ox = -m + off[1].x;
  const oy = off[1].y;
  ctx.textAlign = "center";
  for (const s of city.signs) {
    const blink = (t / 1000 + s.phase) % 7;
    const on = blink < 0.12 || (blink > 0.3 && blink < 0.36) ? 0.15 : 0.85 + 0.15 * Math.sin(t / 300 + s.phase);
    const x = s.x + ox;
    const y = s.y + oy;
    if (x < -40 || x > w + 40) continue;
    ctx.fillStyle = "rgba(4,3,8,.85)";
    ctx.fillRect(x, y, s.w, s.h);
    neonRect(ctx, x, y, s.w, s.h, s.color, on * fade);
    const chars = [...s.text];
    const fs = Math.min(s.w * 0.62, (s.h - 10) / chars.length);
    ctx.font = `700 ${fs}px "JetBrains Mono", monospace`;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 10 * on;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = on * fade;
    chars.forEach((ch, i) => ctx.fillText(ch, x + s.w / 2, y + 8 + fs * (i + 0.85)));
    ctx.shadowBlur = 0;
    ctx.globalAlpha = fade;
  }
  ctx.textAlign = "left";

  // billboard: a retro invader, two frames
  const b = city.board;
  const bx = b.x + ox;
  const by = b.y + oy;
  ctx.fillStyle = "rgba(10,4,20,.9)";
  ctx.fillRect(bx, by, b.w, b.h);
  neonRect(ctx, bx, by, b.w, b.h, "#ff2bd6", 0.8 * fade);
  const sprite = Math.floor(t / 500) % 2 ? INVADER : INVADER2;
  const px = Math.max(1, Math.floor(Math.min((b.w * 0.5) / 11, (b.h * 0.62) / 8)));
  const sx = bx + 8 + ((Math.sin(t / 1400) + 1) / 2) * (b.w - 16 - 11 * px);
  ctx.fillStyle = "#39ff88";
  ctx.globalAlpha = 0.85 * fade;
  sprite.forEach((row, yy) => [...row].forEach((v, xx) => v === "1" && ctx.fillRect(sx + xx * px, by + 6 + yy * px, px, px)));
  ctx.font = `${Math.max(8, b.h * 0.15)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = "#ffd400";
  ctx.globalAlpha = (Math.floor(t / 700) % 2 ? 1 : 0.35) * fade;
  ctx.fillText("INSERT COIN", bx + 8, by + b.h - 6);
  ctx.globalAlpha = fade;

  ctx.drawImage(city.layers[2], -m + off[2].x, off[2].y, w + 2 * m, h + 40);

  // arcade screen + marquee on the near slab
  const a = city.arcade;
  const ax = a.x - m + off[2].x;
  const ay = a.y + off[2].y;
  ctx.fillStyle = "#ff2bd6";
  ctx.shadowColor = "#ff2bd6";
  ctx.shadowBlur = 12;
  ctx.fillRect(ax + a.w * 0.08, ay + a.h * 0.03, a.w * 0.84, a.h * 0.1);
  ctx.shadowColor = "#00f0ff";
  ctx.fillStyle = "#06222a";
  ctx.fillRect(ax + a.w * 0.12, ay + a.h * 0.2, a.w * 0.62, a.h * 0.24);
  ctx.shadowBlur = 0;
  const cells = 6;
  const cw = (a.w * 0.62) / cells;
  for (let i = 0; i < cells * 4; i++) {
    if (Math.sin(i * 12.9 + Math.floor(t / 180)) < 0.3) continue;
    ctx.fillStyle = i % 3 ? "#00f0ff" : "#ffd400";
    ctx.fillRect(ax + a.w * 0.12 + (i % cells) * cw + 1, ay + a.h * 0.2 + Math.floor(i / cells) * ((a.h * 0.24) / 4) + 1, cw - 2, (a.h * 0.24) / 4 - 2);
  }

  // rain, faint
  ctx.strokeStyle = `rgba(160,200,255,${0.07 * fade})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const rn = city.rain;
  for (let i = 0; i < rn.length; i += 3) {
    const x = ((rn[i] * w + t * 0.05) % (w + 40)) - 20;
    const y = (rn[i + 1] * h + t * (0.6 + rn[i + 2] * 0.5)) % h;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y + 14);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}
