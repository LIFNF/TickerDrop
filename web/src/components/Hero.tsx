import { useEffect, useRef, useState } from "react";
import { t } from "../lib/copy";
import type { Ticker } from "../lib/data";

const COLS = 61;
const ROWS = 52; // 61 x 52 = 3172
const S = 12;
const GAP = 2;

function Fan() {
  return (
    <div className="fan">
      <svg viewBox="-100 -100 200 200">
        <g fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.18)" strokeWidth=".6">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d="M0-16C26-58 64-70 86-52C60-36 34-24 0-16z" transform={`rotate(${i * 40})`} />
          ))}
        </g>
        <circle r="22" fill="#05060a" stroke="rgba(255,255,255,.25)" />
        <circle r="8" fill="none" stroke="#ffd400" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function heatColor(h: number, top: boolean) {
  if (h > 0) {
    const k = Math.min(1, h);
    if (k > 0.75) return `rgb(255,${Math.round(212 - (k - 0.75) * 4 * 169)},${Math.round((k - 0.75) * 4 * 214)})`;
    const a = 0.12 + k * 1.1;
    return `rgba(255,212,0,${a.toFixed(3)})`;
  }
  const k = Math.min(1, -h);
  return top ? `rgba(255,212,0,${(0.1 - k * 0.04).toFixed(3)})` : `rgba(0,240,255,${(0.05 + k * 0.14).toFixed(3)})`;
}

function Die({ tickers }: { tickers: Ticker[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const names = useRef<Ticker[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; t: Ticker } | null>(null);
  names.current = tickers;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const W = COLS * S;
    const H = ROWS * S;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.scale(dpr, dpr);

    const n = COLS * ROWS;
    const heat = new Float32Array(n).map(() => (Math.random() - 0.55) * 0.5);
    let picked: number[] = [];
    let phase = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);

    const pick = () => {
      const order = Array.from(heat.keys()).filter((i) => heat[i] > 0).sort((a, b) => heat[b] - heat[a]);
      let sum = 0;
      picked = [];
      for (const i of order) {
        if (sum >= 1.6) break;
        picked.push(i);
        sum += heat[i];
      }
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || t - last < 55) return;
      last = t;

      const cycle = (t / 1000) % 6;
      for (let i = 0; i < n; i++) {
        heat[i] += (Math.random() - 0.5) * 0.07 - heat[i] * 0.015;
        if (Math.random() < 0.00025) heat[i] = 0.9 + Math.random() * 0.4;
      }

      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const x = (i % COLS) * S;
        const y = Math.floor(i / COLS) * S;
        ctx.fillStyle = heatColor(heat[i], i < 100);
        ctx.fillRect(x, y, S - GAP, S - GAP);
      }

      // sweep, then mark the board
      if (cycle < 1.4) {
        if (phase !== 1) phase = 1;
        const sx = (cycle / 1.4) * W;
        const g = ctx.createLinearGradient(sx - 60, 0, sx, 0);
        g.addColorStop(0, "rgba(255,43,214,0)");
        g.addColorStop(1, "rgba(255,43,214,.35)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - 60, 0, 60, H);
        ctx.fillStyle = "#ff2bd6";
        ctx.fillRect(sx, 0, 1.5, H);
      } else {
        if (phase !== 2) {
          phase = 2;
          pick();
        }
        const a = Math.max(0, 1 - (cycle - 1.4) / 4.6);
        ctx.lineWidth = 1.5;
        ctx.font = "bold 10px JetBrains Mono, monospace";
        picked.forEach((i, k) => {
          const x = (i % COLS) * S;
          const y = Math.floor(i / COLS) * S;
          ctx.strokeStyle = `rgba(255,212,0,${a})`;
          ctx.strokeRect(x - 3, y - 3, S + 4, S + 4);
          const t = names.current[i];
          if (t && k < 6) {
            const label = t.s;
            const lx = Math.min(x + S + 4, W - 40);
            ctx.fillStyle = `rgba(0,0,0,${a * 0.85})`;
            ctx.fillRect(lx - 2, y - 2, ctx.measureText(label).width + 4, 13);
            ctx.fillStyle = `rgba(255,212,0,${a})`;
            ctx.fillText(label, lx, y + 8);
          }
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const move = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - r.left) / r.width) * COLS);
    const cy = Math.floor(((e.clientY - r.top) / r.height) * ROWS);
    const t = tickers[cy * COLS + cx];
    if (!t) return setTip(null);
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, t });
  };

  return (
    <div className="die">
      <canvas ref={ref} onMouseMove={move} onMouseLeave={() => setTip(null)} style={{ aspectRatio: `${COLS} / ${ROWS}` }} />
      {tip && (
        <div className="die-tip" style={{ left: tip.x, top: tip.y }}>
          #{tip.t.id} <b style={{ color: tip.t.id <= 100 ? "var(--y)" : undefined }}>{tip.t.s}</b>
          <small>{tip.t.n}</small>
        </div>
      )}
    </div>
  );
}

export function Hero({ tickers }: { tickers: Ticker[] }) {
  return (
    <header className="hero wrap">
      <div className="kicker">{t.hero.kicker}</div>
      <h1 data-t="TICKERDROP">
        <span>TICKERDROP</span>
      </h1>
      <p className="lines">
        {t.hero.line1}
        <br />
        <b>{t.hero.line2}</b>
      </p>
      <div className="stats">
        {t.hero.stats.map(([k, v]) => (
          <div key={k}>
            <b>{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>

      <div className="gpu panel">
        <div className="gpu-body">
          <Fan />
          <Die tickers={tickers} />
          <Fan />
        </div>
        <div className="die-cap">
          <span>{t.hero.die}</span>
          <span>3172 / {COLS}×{ROWS}</span>
        </div>
        <div className="gpu-io">
          <div className="pcie">
            {Array.from({ length: 40 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <a className="btn" href="#engine">
            {t.hero.cta} ↓
          </a>
        </div>
        <div className="rgb" style={{ marginTop: 18 }} />
      </div>
    </header>
  );
}
