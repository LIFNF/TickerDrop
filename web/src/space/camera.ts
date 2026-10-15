export type Rect = { x: number; y: number; w: number; h: number };

export const MIN_K = 0.08;
export const MAX_K = 6;

const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// screen = world * k + (x, y)
export class Camera {
  x = 0;
  y = 0;
  k = 0.3;
  private subs = new Set<() => void>();
  private anim = 0;
  private vel = { x: 0, y: 0 };

  on(fn: () => void) {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }

  private emit() {
    this.subs.forEach((f) => f());
  }

  toWorld(sx: number, sy: number) {
    return { x: (sx - this.x) / this.k, y: (sy - this.y) / this.k };
  }

  set(x: number, y: number, k: number) {
    this.x = x;
    this.y = y;
    this.k = k;
    this.emit();
  }

  stop() {
    cancelAnimationFrame(this.anim);
    this.anim = 0;
  }

  pan(dx: number, dy: number) {
    this.stop();
    this.set(this.x + dx, this.y + dy, this.k);
  }

  zoomAt(sx: number, sy: number, factor: number) {
    this.stop();
    const k = clampK(this.k * factor);
    const f = k / this.k;
    this.set(sx - (sx - this.x) * f, sy - (sy - this.y) * f, k);
  }

  // release velocity in px/ms
  glide(vx: number, vy: number) {
    this.stop();
    this.vel = { x: vx * 16, y: vy * 16 };
    const step = () => {
      this.vel.x *= 0.92;
      this.vel.y *= 0.92;
      if (Math.hypot(this.vel.x, this.vel.y) < 0.3) return (this.anim = 0);
      this.set(this.x + this.vel.x, this.y + this.vel.y, this.k);
      this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  // put world point (wx, wy) at screen point (sx, sy) with zoom k
  fly(wx: number, wy: number, k: number, sx: number, sy: number, ms = 900) {
    this.stop();
    k = clampK(k);
    const from = { cx: (sx - this.x) / this.k, cy: (sy - this.y) / this.k, lk: Math.log(this.k) };
    const to = { cx: wx, cy: wy, lk: Math.log(k) };
    // zoom out a little on long hops so the move reads as travel
    const hop = Math.hypot(to.cx - from.cx, to.cy - from.cy) * Math.min(this.k, k);
    const dip = Math.min(0.9, hop / 2400);
    const t0 = performance.now();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
    const step = (now: number) => {
      const p = ms ? Math.min(1, (now - t0) / ms) : 1;
      const e = ease(p);
      const lk = from.lk + (to.lk - from.lk) * e - dip * Math.sin(Math.PI * e);
      const kk = Math.exp(lk);
      const cx = from.cx + (to.cx - from.cx) * e;
      const cy = from.cy + (to.cy - from.cy) * e;
      this.set(sx - cx * kk, sy - cy * kk, kk);
      this.anim = p < 1 ? requestAnimationFrame(step) : 0;
    };
    this.anim = requestAnimationFrame(step);
  }

  fit(box: Rect, area: Rect, pad = 60, maxK = 1.25, ms?: number) {
    const k = Math.min(maxK, (area.w - pad * 2) / box.w, (area.h - pad * 2) / box.h);
    this.fly(box.x + box.w / 2, box.y + box.h / 2, k, area.x + area.w / 2, area.y + area.h / 2, ms);
  }
}
