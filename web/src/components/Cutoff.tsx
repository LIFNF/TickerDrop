import { useMemo, useState } from "react";
import { t,tx } from "../lib/copy";
import type { Ticker } from "../lib/data";
import {numberLocale} from "../lib/locale";

type Mv = { s: string; g: number };

const PAL = ["#ffd400", "#ff2bd6", "#00f0ff", "#39ff88", "#ff8a00", "#9d7bff", "#ff4d6d", "#7ad7ff", "#e6ff4d", "#ff9de6"];

const PRESETS: Mv[][] = [
  [
    { s: "JBDI", g: 46.2 },
    { s: "QNTM", g: 31.5 },
    { s: "AEHL", g: 18.4 },
    { s: "MULN", g: 12.9 },
    { s: "SOBR", g: 9.7 },
    { s: "HOLO", g: 7.4 },
    { s: "NVDA", g: 3.1 },
    { s: "TSLA", g: 2.2 },
    { s: "AMZN", g: -0.4 },
    { s: "META", g: -1.6 },
  ],
  [
    { s: "AAPL", g: 1.9 },
    { s: "MSFT", g: 1.2 },
    { s: "COST", g: 0.7 },
    { s: "PEP", g: 0.35 },
    { s: "GOOGL", g: 0 },
    { s: "AVGO", g: -0.9 },
    { s: "NFLX", g: -2.3 },
    { s: "AMD", g: -3.8 },
  ],
  [
    { s: "NVDA", g: -0.3 },
    { s: "AAPL", g: -0.8 },
    { s: "MSFT", g: -1.2 },
    { s: "AMZN", g: -2.5 },
    { s: "TSLA", g: -3.1 },
    { s: "META", g: -4.0 },
  ],
];

function gauss() {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randomSession(tickers: Ticker[]) {
  const drift = gauss() * 1.2;
  const all = tickers.map((t) => {
    let g = drift + gauss() * 2.4;
    const r = Math.random();
    if (r < 0.012) g = 6 + Math.exp(Math.random() * 4.2);
    else if (r < 0.03) g = 3 + Math.random() * 12;
    return { s: t.s, g: Math.round(g * 100) / 100 };
  });
  return all;
}

function solve(list: Mv[]) {
  const pos = list.filter((m) => m.g > 0).sort((a, b) => b.g - a.g);
  let cum = 0;
  const rows = pos.map((m) => {
    const w = cum >= 100 ? 0 : Math.min(m.g, 100 - cum);
    cum += w;
    return { ...m, w, cum };
  });
  const total = cum;
  const sumPos = pos.reduce((s, m) => s + m.g, 0);
  return { rows: rows.map((r) => ({ ...r, share: total ? (r.w / total) * 100 : 0 })), total, sumPos };
}

const f = (n: number, d = 2) => n.toLocaleString(numberLocale(),{maximumFractionDigits:d}) + "%";

type Bar = Mv & { w: number; cum: number; share: number; neg: boolean };

// narrow screens: same data, one row per listing
function Rows({ bars, total }: { bars: Bar[]; total: number }) {
  const c = t.cutoff;
  const X = 56;
  const L = 170;
  const H = 28;
  const maxPos = Math.max(1, ...bars.filter((b) => !b.neg).map((b) => b.g));
  const maxNeg = Math.max(0.5, ...bars.filter((b) => b.neg).map((b) => -b.g));
  const tankY = 30 + bars.length * H + 26;
  let acc = 0;
  return (
    <svg className="tall" viewBox={`0 0 360 ${tankY + (total > 0 && total < 100 ? 72 : 52)}`}>
      <text y="12" fill="#8a8ea3" fontSize="10" letterSpacing="2">
        {c.gain.toUpperCase()}
      </text>
      <text x="360" y="12" fill="#8a8ea3" fontSize="10" textAnchor="end">
        Σ
      </text>
      {bars.map((b, i) => {
        const y = 26 + i * H;
        const color = PAL[i % PAL.length];
        if (b.neg) {
          const len = Math.max(2, (Math.min(-b.g, maxNeg) / maxNeg) * 40);
          return (
            <g key={b.s + i} opacity=".55">
              <text y={y + 13} fill="#8a8ea3" fontSize="12" fontWeight="700">
                {b.s}
              </text>
              <rect x={X} y={y + 2} width={len} height="14" fill="none" stroke="#00f0ff" strokeOpacity=".5" />
              <text x={X + len + 6} y={y + 13} fill="#8a8ea3" fontSize="11">
                {b.g === 0 ? "0%" : f(b.g)}
              </text>
              <text x="360" y={y + 13} fill="#4a4e63" fontSize="10" textAnchor="end">
                {c.out}
              </text>
            </g>
          );
        }
        const full = (b.g / maxPos) * L;
        const on = b.w > 0;
        const clipped = on && b.w < b.g;
        return (
          <g key={b.s + i}>
            <text y={y + 13} fill={on ? "#e8e9f0" : "#4a4e63"} fontSize="12" fontWeight="700">
              {b.s}
            </text>
            <rect x={X} y={y + 2} width={full} height="14" fill={on ? "url(#cutHatch)" : "rgba(255,255,255,.07)"} />
            {on && <rect className="gx" x={X} y={y + 2} width={(b.w / maxPos) * L} height="14" fill={color} style={{ animationDelay: `${i * 60}ms` }} />}
            <text x={X + full + 6} y={y + 13} fill={on ? color : "#4a4e63"} fontSize="11" fontWeight="700">
              +{f(b.g)}
            </text>
            <text x="360" y={y + 13} fill={clipped ? "#ff2bd6" : on ? "#8a8ea3" : "#4a4e63"} fontSize="10" textAnchor="end">
              {on ? `Σ ${f(b.cum, 1)}` : c.out}
            </text>
          </g>
        );
      })}

      <text y={tankY - 8} fill="#8a8ea3" fontSize="10" letterSpacing="2">
        {c.share.toUpperCase()} · 100%
      </text>
      <rect y={tankY} width="360" height="40" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.2)" />
      {total === 0 && (
        <text x="180" y={tankY + 25} textAnchor="middle" fill="#ff2bd6" fontSize="12" letterSpacing="3">
          {tx("ROLLOVER →")}
        </text>
      )}
      {bars
        .filter((b) => !b.neg && b.share > 0)
        .map((b) => {
          const i = bars.indexOf(b);
          const w = (360 * b.share) / 100;
          const x = acc;
          acc += w;
          return (
            <g key={"t" + b.s}>
              <rect className="gx" x={x} y={tankY} width={w} height="40" fill={PAL[i % PAL.length]} opacity=".9" />
              {w > 44 && (
                <>
                  <text x={x + 6} y={tankY + 17} fill="#05060a" fontSize="11" fontWeight="700">
                    {b.s}
                  </text>
                  <text x={x + 6} y={tankY + 32} fill="#05060a" fontSize="10">
                    {f(b.share, 1)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      {total > 0 && total < 100 && (
        <text x="360" y={tankY + 60} textAnchor="end" fill="#8a8ea3" fontSize="10">
          ×{(100 / total).toFixed(2)} {tx("pro rata")}
        </text>
      )}
    </svg>
  );
}

export function Cutoff({ tickers }: { tickers: Ticker[] }) {
  const c = t.cutoff;
  const [tab, setTab] = useState(0);
  const [seed, setSeed] = useState(0);

  const data = useMemo(() => {
    if (tab < 3) return PRESETS[tab];
    return seed >= 0 && tickers.length ? randomSession(tickers) : PRESETS[0];
  }, [tab, seed, tickers]);

  const { rows, total, sumPos } = useMemo(() => solve(data), [data]);

  const paid = rows.filter((r) => r.w > 0);
  const outCount = rows.length - paid.length;
  const shownPos = rows.slice(0, Math.max(paid.length + 2, Math.min(rows.length, 6))).slice(0, 10);
  const neg = data
    .filter((m) => m.g <= 0)
    .sort((a, b) => b.g - a.g)
    .slice(0, Math.max(2, 10 - shownPos.length));
  const bars = [...shownPos.map((r) => ({ ...r, neg: false })), ...neg.map((m) => ({ ...m, w: 0, cum: 0, share: 0, neg: true }))];

  // geometry
  const W = 1000;
  const X0 = 60;
  const X1 = 980;
  const top = 52;
  const base = 230;
  const negH = 50;
  const maxPos = Math.max(1, ...bars.filter((b) => !b.neg).map((b) => b.g));
  const maxNeg = Math.max(0.5, ...bars.filter((b) => b.neg).map((b) => -b.g));
  const slot = (X1 - X0) / Math.max(bars.length, 6);
  const bw = Math.min(54, slot * 0.56);
  const hy = (g: number) => (g / maxPos) * (base - top);

  const cut = paid.find((r) => r.w < r.g);
  const verdict =
    total === 0 ? c.none : total >= 100 && cut ? c.capAt(cut.s, f(cut.w), outCount) : total >= 100 ? c.capAt(paid[paid.length - 1].s, f(paid[paid.length - 1].w), outCount) : c.under(f(sumPos));

  const tankY = 330;
  let acc = 0;

  return (
    <section className="mod" id="cutoff">
      <div className="sh">
        <span className="idx">02</span>
        <h2>{c.title}</h2>
        <p>{c.lead}</p>
      </div>

      <div className="tabs">
        {c.tabs.map((name, i) => (
          <button
            key={name}
            className={tab === i ? "on" : ""}
            onClick={() => {
              setTab(i);
              if (i === 3) setSeed((s) => s + 1);
            }}
          >
            {i === 3 ? "↻ " : ""}
            {name}
          </button>
        ))}
      </div>

      <div className="panel chart">
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <defs>
            <pattern id="cutHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="6" fill="#ff2bd6" opacity=".75" />
            </pattern>
          </defs>
        </svg>
        <svg className="wide" viewBox={`0 0 ${W} 420`} key={`${tab}-${seed}`}>

          <text x={X0} y="16" fill="#8a8ea3" fontSize="11" letterSpacing="2">
            {c.gain.toUpperCase()}
          </text>
          <line x1={X0 - 10} x2={X1} y1={base} y2={base} stroke="rgba(255,255,255,.25)" />
          {[0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line x1={X0 - 10} x2={X1} y1={base - k * (base - top)} y2={base - k * (base - top)} stroke="rgba(255,255,255,.05)" />
              <text x={X0 - 16} y={base - k * (base - top) + 4} fill="#4a4e63" fontSize="10" textAnchor="end">
                {f(maxPos * k, 1)}
              </text>
            </g>
          ))}

          {bars.map((b, i) => {
            const x = X0 + slot * i + (slot - bw) / 2;
            const color = PAL[i % PAL.length];
            if (b.neg) {
              const h = (Math.min(-b.g, maxNeg) / maxNeg) * negH;
              return (
                <g key={b.s + i} opacity=".55">
                  <rect x={x} y={base} width={bw} height={Math.max(h, 1.5)} fill="url(#cutHatch)" style={{ opacity: 0.35 }} />
                  <rect x={x} y={base} width={bw} height={Math.max(h, 1.5)} fill="none" stroke="#00f0ff" strokeOpacity=".5" />
                  <text x={x + bw / 2} y={base + h + 16} textAnchor="middle" fill="#8a8ea3" fontSize="11">
                    {b.g === 0 ? "0%" : f(b.g)}
                  </text>
                  <text x={x + bw / 2} y={base - 8} textAnchor="middle" fill="#8a8ea3" fontSize="12" fontWeight="700">
                    {b.s}
                  </text>
                </g>
              );
            }
            const full = hy(b.g);
            const keep = hy(b.w);
            const on = b.w > 0;
            return (
              <g key={b.s + i}>
                <rect x={x} y={base - full} width={bw} height={full} fill={on ? "url(#cutHatch)" : "rgba(255,255,255,.07)"} />
                {on && (
                  <rect className="gy" x={x} y={base - keep} width={bw} height={keep} fill={color} style={{ filter: `drop-shadow(0 0 8px ${color}66)`, animationDelay: `${i * 60}ms` }} />
                )}
                <text x={x + bw / 2} y={base - full - 8} textAnchor="middle" fill={on ? color : "#4a4e63"} fontSize="12" fontWeight="700">
                  +{f(b.g)}
                </text>
                <text x={x + bw / 2} y={base + 18} textAnchor="middle" fill={on ? "#e8e9f0" : "#4a4e63"} fontSize="12" fontWeight="700">
                  {b.s}
                </text>
                <text x={x + bw / 2} y={base + 34} textAnchor="middle" fill={on ? "#8a8ea3" : "#4a4e63"} fontSize="10">
                  {on ? `Σ ${f(b.cum, 1)}` : c.out}
                </text>
                {on && b.w < b.g && (
                  <text x={x + bw / 2} y={base + 48} textAnchor="middle" fill="#ff2bd6" fontSize="10">
                    {c.clip}
                  </text>
                )}
              </g>
            );
          })}

          {/* pool tank */}
          <text x={X0} y={tankY - 12} fill="#8a8ea3" fontSize="11" letterSpacing="2">
            {c.share.toUpperCase()} · 100%
          </text>
          <rect x={X0} y={tankY} width={X1 - X0} height="46" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.2)" />
          {total === 0 && (
            <text x={(X0 + X1) / 2} y={tankY + 29} textAnchor="middle" fill="#ff2bd6" fontSize="13" letterSpacing="4">
              {tx("ROLLOVER →")}
            </text>
          )}
          {bars
            .filter((b) => !b.neg && b.share > 0)
            .map((b) => {
              const i = bars.indexOf(b);
              const w = ((X1 - X0) * b.share) / 100;
              const x = X0 + acc;
              acc += w;
              const color = PAL[i % PAL.length];
              return (
                <g key={"t" + b.s}>
                  <rect className="gx" x={x} y={tankY} width={w} height="46" fill={color} opacity=".9" />
                  {w > 54 && (
                    <>
                      <text x={x + 8} y={tankY + 20} fill="#05060a" fontSize="12" fontWeight="700">
                        {b.s}
                      </text>
                      <text x={x + 8} y={tankY + 36} fill="#05060a" fontSize="11">
                        {f(b.share)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          {paid.length > 0 && total < 100 && (
            <text x={X1} y={tankY + 66} textAnchor="end" fill="#8a8ea3" fontSize="11">
              ×{(100 / total).toFixed(2)} {tx("pro rata")}
            </text>
          )}
        </svg>
        <Rows bars={bars} total={total} key={`m${tab}-${seed}`} />
        <p className="verdict">{verdict}</p>
      </div>

      <div className="panel formula">
        <span className="eq">
          <var>w</var>
          <sub>i</sub> = min( <var>g</var>
          <sub>i</sub> , 100% − Σ<sub>j&lt;i</sub> <var>w</var>
          <sub>j</sub> )
        </span>
        <span className="eq">
          {tx("Allocation")}<sub>i</sub> ={" "}
          <span className="frac">
            <span>
              <var>w</var>
              <sub>i</sub>
            </span>
            <span>
              Σ <var>w</var>
            </span>
          </span>{" "}
          × {tx("POOL")}
        </span>
        <span className="eq" style={{ color: "var(--dim)", fontSize: 13 }}>
          g ≤ 0 → 0 · Σw = 0 → {tx("rollover")}
        </span>
      </div>

      <div className="spec">
        {c.rules.map(([h, p], i) => (
          <div key={h}>
            <small>R{String(i + 1).padStart(2, "0")}</small>
            <h4>{h}</h4>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
