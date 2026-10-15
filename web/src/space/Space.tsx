import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { gainPct } from "../lib/session";
import type { Camera } from "./camera";
import { draw, type Focus, type Paint } from "./draw";
import { index, type NodeId } from "./layout";

type Props = {
  cam: Camera;
  paint: Paint;
  focus: Focus;
  onTap(f: Focus): void;
  onMove(): void;
  children: ReactNode;
};

type Pt = { x: number; y: number };

export function Space({ cam, paint, focus, onTap, onMove, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const hit = useMemo(() => index(paint.stars), [paint.stars]);

  // the render loop and the handlers read these without re-subscribing
  const now = useRef({ paint, focus, hover: 0, hit, onTap, onMove });
  now.current = { ...now.current, paint, focus, hit, onTap, onMove };

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let moved = 0;
    let still = 0;

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    const apply = () => {
      const s = world.current!.style;
      s.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.k})`;
      s.setProperty("--inv", String(Math.min(3.4, Math.max(1, 0.9 / cam.k))));
      moved = performance.now();
      el.classList.add("moving");
      clearTimeout(still);
      still = window.setTimeout(() => el.classList.remove("moving"), 160);
    };
    const off = cam.on(apply);
    apply();

    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      // idle at ~30fps, full rate while the view moves
      if (t - moved > 300 && t - last < 32) return;
      last = t;
      const n = now.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h, cam, n.paint, { t, focus: n.focus, hover: n.hover });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(still);
      ro.disconnect();
      off();
    };
  }, [cam]);

  useEffect(() => {
    const el = root.current!;
    const pts = new Map<number, Pt>();
    let start: (Pt & { id: number }) | null = null;
    let dragged = false;
    let last = { x: 0, y: 0, t: 0 };
    let vel = { x: 0, y: 0 };
    let pinch: { d: number; m: Pt } | null = null;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pair = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };

    const starAt = (p: Pt) => {
      const wp = cam.toWorld(p.x, p.y);
      return now.current.hit(wp.x, wp.y, Math.max(4, 12 / cam.k));
    };

    const hover = (p: Pt, target: EventTarget | null) => {
      const overNode = (target as Element | null)?.closest?.("[data-node]");
      const s = overNode ? undefined : starAt(p);
      now.current.hover = s?.id ?? 0;
      el.style.cursor = s || overNode ? "pointer" : "";
      const tp = tip.current!;
      if (!s) {
        tp.hidden = true;
        return;
      }
      const n = now.current.paint;
      const tk = n.tickers[s.id - 1];
      const g = n.gains?.[s.id - 1];
      tp.hidden = false;
      tp.style.transform = `translate(${Math.min(p.x + 16, el.clientWidth - 220)}px, ${p.y + 16}px)`;
      tp.innerHTML = "";
      const head = document.createElement("div");
      head.innerHTML = `<span>#${s.id}</span> <b></b> <em></em>`;
      head.querySelector("b")!.textContent = tk?.s ?? "";
      const em = head.querySelector("em")!;
      if (g !== undefined && g !== null) {
        em.textContent = gainPct(g);
        em.className = g > 0 ? "up" : "dn";
      }
      const name = document.createElement("small");
      name.textContent = tk?.n ?? "";
      tp.append(head, name);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cam.stop();
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) {
        const p = local(e);
        start = { ...p, id: e.pointerId };
        dragged = false;
        last = { ...p, t: performance.now() };
        vel = { x: 0, y: 0 };
      } else if (pts.size === 2) {
        pinch = pair();
        dragged = true;
        for (const id of pts.keys()) if (!el.hasPointerCapture(id)) el.setPointerCapture(id);
      }
    };

    const move = (e: PointerEvent) => {
      const p = local(e);
      if (!pts.has(e.pointerId)) {
        if (e.pointerType === "mouse") hover(p, e.target);
        return;
      }
      pts.set(e.pointerId, p);
      if (pinch && pts.size >= 2) {
        const q = pair();
        cam.zoomAt(q.m.x, q.m.y, q.d / pinch.d);
        cam.pan(q.m.x - pinch.m.x, q.m.y - pinch.m.y);
        pinch = q;
        return;
      }
      if (!start) return;
      if (!dragged && Math.hypot(p.x - start.x, p.y - start.y) > 5) {
        dragged = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add("grabbing");
        tip.current!.hidden = true;
        now.current.onMove();
      }
      if (dragged) {
        const t = performance.now();
        const dt = Math.max(1, t - last.t);
        cam.pan(p.x - last.x, p.y - last.y);
        vel = { x: (p.x - last.x) / dt, y: (p.y - last.y) / dt };
        last = { ...p, t };
      }
    };

    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size === 1) {
        // one finger left after a pinch: keep panning from where it is
        pinch = null;
        const [q] = pts.values();
        last = { ...q, t: performance.now() };
        start = { ...q, id: -1 };
        return;
      }
      if (pts.size) return;
      pinch = null;
      el.classList.remove("grabbing");
      if (!start) return;
      if (!dragged && e.type === "pointerup") {
        const hitNode = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node]");
        if (hitNode) now.current.onTap({ kind: "node", id: hitNode.dataset.node as NodeId });
        else {
          const s = starAt(local(e));
          now.current.onTap(s ? { kind: "tk", id: s.id } : null);
        }
      } else if (dragged && performance.now() - last.t < 80) cam.glide(vel.x, vel.y);
      start = null;
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        cam.pan(-e.deltaX * unit, 0);
        return;
      }
      cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0014)));
      now.current.onMove();
    };

    // Safari trackpad pinch
    let g0 = 1;
    const gs = (e: Event) => {
      e.preventDefault();
      g0 = 1;
    };
    const gc = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const p = local(ge);
      cam.zoomAt(p.x, p.y, ge.scale / g0);
      g0 = ge.scale;
    };

    const leave = () => {
      now.current.hover = 0;
      tip.current!.hidden = true;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("gesturestart", gs);
    el.addEventListener("gesturechange", gc);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("gesturestart", gs);
      el.removeEventListener("gesturechange", gc);
    };
  }, [cam]);

  return (
    <div className="space" ref={root}>
      <canvas ref={canvas} />
      <div className="world" ref={world}>
        {children}
      </div>
      <div className="tip" ref={tip} hidden />
    </div>
  );
}
