// tiny sprite painter: fill cells on a grid, emit row-merged SVG rects

export const INK = "#07080a";

export function sprite(w: number, h: number) {
  const g: (string | undefined)[] = new Array(w * h);
  const set = (x: number, y: number, c: string | undefined) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < w && y >= 0 && y < h) g[y * w + x] = c;
  };
  const rect = (x: number, y: number, rw: number, rh: number, c: string | undefined) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, c);
  };
  // Bresenham
  const line = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  };
  // call fn for every cell centre within r of (cx, cy) with its distance and angle
  const disc = (cx: number, cy: number, r: number, fn: (x: number, y: number, d: number, a: number) => void) => {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d <= r) fn(x, y, d, Math.atan2(dy, dx));
      }
  };
  const svg = () => {
    let out = "";
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const c = g[y * w + x];
        let n = 1;
        while (x + n < w && g[y * w + x + n] === c) n++;
        if (c) out += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
        x += n;
      }
    }
    return out;
  };
  return { set, rect, line, disc, svg };
}
