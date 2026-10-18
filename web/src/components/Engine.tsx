import { t,tx } from "../lib/copy";
import { SUPPLY, DROP,REFERRAL_DROP } from "../chain/config";
import {compact,pct} from "../lib/format";

const Y = "#ffd400";
const M = "#ff2bd6";
const C = "#00f0ff";
const DIM = "rgba(255,255,255,.35)";

function Packet({ path, color, dur, delay = 0 }: { path: string; color: string; dur: number; delay?: number }) {
  return (
    <circle r="3.5" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
      <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" path={path} />
    </circle>
  );
}

function Wire({ d, color, dur, delay, op = ".35" }: { d: string; color: string; dur: number; delay?: number; op?: string }) {
  return (
    <>
      <path className="wire" d={d} stroke={color} strokeOpacity={op} />
      <path className="run" d={d} stroke={color} />
      <Packet path={d} color={color} dur={dur} delay={delay} />
    </>
  );
}

function Node({ x, y, w, h, title, sub, color, fs = 15 }: { x: number; y: number; w: number; h: number; title: string; sub?: string; color: string; fs?: number }) {
  const pad = fs > 13 ? 20 : 14;
  return (
    <g>
      <path d={`M${x} ${y}h${w - 12}l12 12v${h - 12}h${-w + 12}l-12 -12z`} fill="#0b0d16" stroke={color} strokeOpacity=".7" />
      <rect x={x} y={y + 14} width="3" height={h - 28} fill={color} />
      <text x={x + pad} y={y + (sub ? h / 2 - 2 : h / 2 + 5)} fill="#e8e9f0" fontSize={fs} fontWeight="700" letterSpacing={fs > 13 ? 1.5 : 0.8}>
        {title}
      </text>
      {sub && (
        <text x={x + pad} y={y + h / 2 + (fs > 13 ? 18 : 15)} fill={DIM} fontSize={fs > 13 ? 11 : 10} letterSpacing="1">
          {sub}
        </text>
      )}
    </g>
  );
}

function Chip() {
  const pins = [];
  for (let i = 0; i < 12; i++) {
    const o = 112 + i * 16;
    pins.push(<rect key={`t${i}`} x={480 + o - 100} y={80} width="6" height="10" />);
    pins.push(<rect key={`b${i}`} x={480 + o - 100} y={330} width="6" height="10" />);
    pins.push(<rect key={`l${i}`} x={470} y={o - 2} width="10" height="6" />);
    pins.push(<rect key={`r${i}`} x={720} y={o - 2} width="10" height="6" />);
  }
  return (
    <g>
      <g fill={Y} opacity=".55">{pins}</g>
      <rect x="480" y="90" width="240" height="240" fill="#090a10" stroke={Y} strokeOpacity=".6" />
      <rect x="512" y="122" width="176" height="176" fill="url(#dieGrid)" stroke="rgba(255,255,255,.12)" />
      <rect x="512" y="122" width="176" height="176" fill="url(#dieGlow)" />
      <text x="600" y="205" textAnchor="middle" fill={Y} fontSize="22" fontWeight="700" letterSpacing="3">
        GAINPOOL
      </text>
      <text x="600" y="232" textAnchor="middle" fill="#e8e9f0" fontSize="12" letterSpacing="2">
        ETH + TICKR
      </text>
      <path d="M480 90l14 0l-14 14z" fill={Y} />
    </g>
  );
}

function Clock({ label, side }: { label: string; side?: boolean }) {
  return (
    <>
      <circle r="30" fill="#0b0d16" stroke={Y} strokeOpacity=".7" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} y1="-26" y2={i % 3 ? "-23" : "-20"} stroke="rgba(255,255,255,.4)" transform={`rotate(${i * 30})`} />
      ))}
      <line y2="-18" stroke={Y} strokeWidth="2" transform="rotate(180)" />
      <line y2="-12" stroke="#fff" strokeWidth="2" transform="rotate(285)" />
      {side ? (
        <text x="42" y="5" fill={Y} fontSize="13" letterSpacing="1.5">
          {label}
        </text>
      ) : (
        <>
          <line y1="30" y2="82" stroke={Y} strokeDasharray="2 4" />
          <text y="-40" textAnchor="middle" fill={Y} fontSize="12" letterSpacing="1.5">
            {label}
          </text>
        </>
      )}
    </>
  );
}

const board = [
  { s: "JBDI", g: 46.2 },
  { s: "QNTM", g: 31.5 },
  { s: "AEHL", g: 18.4 },
  { s: "MULN", g: 12.9 },
  { s: "SOBR", g: 9.7 },
];

function Board({ label, out, clip }: { label: string; out: string; clip: string }) {
  let cum = 0;
  return (
    <g>
      <path d="M860 60h288l12 12v278h-300z" fill="#0b0d16" stroke="rgba(255,255,255,.18)" />
      <text x="878" y="88" fill={DIM} fontSize="11" letterSpacing="2">
        {label.toUpperCase()}
      </text>
      <text x="1142" y="88" fill={DIM} fontSize="11" textAnchor="end">
        Σ
      </text>
      {board.map((b, i) => {
        const y = 108 + i * 46;
        const take = Math.max(0, Math.min(b.g, 100 - cum));
        const before = cum;
        cum += b.g;
        const paid = take > 0;
        const k = 2.3;
        const w = b.g * k;
        return (
          <g key={b.s} opacity={paid ? 1 : 0.35}>
            <text x="878" y={y + 13} fill={paid ? "#e8e9f0" : DIM} fontSize="13" fontWeight="700">
              {b.s}
            </text>
            <rect x="932" y={y + 2} width={w} height="14" fill="rgba(255,255,255,.06)" />
            <rect className="gx" x="932" y={y + 2} width={take * k} height="14" fill={Y} />
            {take < b.g && paid && <rect x={932 + take * k} y={y + 2} width={(b.g - take) * k} height="14" fill="url(#hatch)" />}
            <text x={936 + w + 4} y={y + 14} fill={paid ? Y : DIM} fontSize="11">
              +{b.g}%
            </text>
            <text x="1142" y={y + 14} fill={DIM} fontSize="11" textAnchor="end">
              {paid ? Math.min(100, before + b.g).toFixed(0) + "%" : out}
            </text>
            {take < b.g && paid && (
              <text x="1142" y={y + 30} fill={M} fontSize="9" textAnchor="end" letterSpacing="1">
                {clip} {take.toFixed(1)}%
              </text>
            )}
          </g>
        );
      })}
      <line x1="870" x2="1150" y1="290" y2="290" stroke={M} strokeDasharray="4 4" />
      <text x="870" y="285" fill={M} fontSize="10" letterSpacing="1">
        100%
      </text>
    </g>
  );
}

function Holder() {
  const e = t.engine;
  return (
    <g>
      <path d="M860 392h300v52l-12 12h-288z" fill="#0b0d16" stroke={Y} strokeOpacity=".7" />
      <text x="878" y="420" fill="#e8e9f0" fontSize="15" fontWeight="700" letterSpacing="1.5">
        {e.holder.toUpperCase()}
      </text>
      <text x="878" y="440" fill={DIM} fontSize="11">
        {tx("NFT + {balance}",{balance:e.hold})}
      </text>
      <text x="1142" y="420" fill={M} fontSize="12" textAnchor="end">
        ETH
      </text>
      <text x="1142" y="440" fill={C} fontSize="12" textAnchor="end">
        TICKR
      </text>
    </g>
  );
}

function Defs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <pattern id="dieGrid" width="11" height="11" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" fill="rgba(255,212,0,.07)" />
        </pattern>
        <radialGradient id="dieGlow">
          <stop offset="0" stopColor={Y} stopOpacity=".22" />
          <stop offset="1" stopColor={Y} stopOpacity="0" />
        </radialGradient>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="5" fill={M} opacity=".7" />
        </pattern>
      </defs>
    </svg>
  );
}

function Wide() {
  const e = t.engine;
  const pRoll = "M880 350 C 860 420 660 410 620 340";
  return (
    <svg className="wide" viewBox="20 30 1160 440">
      <Node x={40} y={70} w={250} h={90} title={e.tickr} sub={tx("PAIR ⇄ WALLET")} color={C} />
      <Node x={40} y={250} w={250} h={90} title={e.nft} sub={tx("3% sale fee")} color={M} />
      <Wire d="M290 115 H380 C430 115 430 170 480 170" color={C} dur={2.2} />
      <Packet path="M290 115 H380 C430 115 430 170 480 170" color={C} dur={2.2} delay={1.1} />
      <Wire d="M290 295 H380 C430 295 430 250 480 250" color={M} dur={2.6} delay={0.4} />
      <text x="300" y="104" fill={C} fontSize="12">
        {e.inTkn}
      </text>
      <text x="300" y="324" fill={M} fontSize="12">
        {e.inEth}
      </text>

      <Chip />
      <Wire d="M730 210 H860" color={Y} dur={1.6} op=".4" />
      <g transform="translate(795 128)">
        <Clock label={e.clock} />
      </g>

      <Board label={e.board} out={t.cutoff.out} clip={t.cutoff.clip} />
      <Wire d="M1010 350 V392" color={Y} dur={1.2} delay={0.6} op=".5" />
      <Holder />

      <path d={pRoll} fill="none" stroke="rgba(255,255,255,.3)" strokeDasharray="3 5" />
      <path d="M616 352l4-12 7 10" fill="none" stroke="rgba(255,255,255,.45)" />
      <text x="740" y="412" fill={DIM} fontSize="11" textAnchor="middle" letterSpacing="1">
        {e.roll}
      </text>
    </svg>
  );
}

// board and holder are drawn at x 860..1160; shift them under the chip
const STACK = "translate(-830 300)";

function Tall() {
  const e = t.engine;
  return (
    <svg className="tall" viewBox="0 0 360 772">
      <Node x={4} y={8} w={164} h={70} title={e.tickr} sub={tx("PAIR ⇄ WALLET")} color={C} fs={12} />
      <Node x={192} y={8} w={164} h={70} title={e.nft} sub={tx("3% sale fee")} color={M} fs={12} />
      <Wire d="M86 78 V100 C86 124 150 112 150 149" color={C} dur={1.8} />
      <Wire d="M274 78 V100 C274 124 210 112 210 149" color={M} dur={2.1} delay={0.4} />
      <text x="4" y="118" fill={C} fontSize="11">
        {e.inTkn}
      </text>
      <text x="356" y="118" fill={M} fontSize="11" textAnchor="end">
        {e.inEth}
      </text>

      <g transform="translate(180 222) scale(.56) translate(-600 -210)">
        <Chip />
      </g>
      <Wire d="M180 296 V360" color={Y} dur={1.2} op=".4" />
      <g transform="translate(232 332) scale(.8)">
        <Clock label={e.clock} side />
      </g>

      <g transform={STACK}>
        <Board label={e.board} out={t.cutoff.out} clip={t.cutoff.clip} />
        <Wire d="M1010 350 V392" color={Y} dur={1.2} delay={0.6} op=".5" />
        <Holder />
      </g>

      <path d="M30 420 C 22 380 22 250 100 226" fill="none" stroke="rgba(255,255,255,.3)" strokeDasharray="3 5" />
      <path d="M92 219l9 7-9 7" fill="none" stroke="rgba(255,255,255,.45)" />
      <text transform="translate(14 400) rotate(-90)" fill={DIM} fontSize="10" letterSpacing="1">
        {e.roll}
      </text>
    </svg>
  );
}

export function Engine() {
  const e = t.engine;
  return (
    <section className="mod" id="engine">
      <div className="sh">
        <span className="idx">01</span>
        <h2>{e.title}</h2>
        <p>{e.lead}</p>
      </div>

      <div className="panel flow">
        <Defs />
        <Wide />
        <Tall />
      </div>

      <div className="points">
        {e.points.map(([h, p]) => (
          <div className="panel" key={h}>
            <h4>{h}</h4>
            <p>{p}</p>
          </div>
        ))}
      </div>

      <Supply />
    </section>
  );
}

function Supply() {
  const drop = SUPPLY * DROP;
  const referral=SUPPLY*REFERRAL_DROP;
  const lp = 1e9 - drop-referral;
  const r = 100;
  const L = 2 * Math.PI * r;
  const a = (drop / 1e9) * L;
  const b = (referral/1e9)*L;
  return (
    <div className="panel supply">
      <svg viewBox="-140 -140 280 280">
        <circle r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="26" />
        <circle r={r} fill="none" stroke={Y} strokeWidth="26" strokeDasharray={`${a} ${L}`} transform="rotate(-90)" />
        <circle r={r} fill="none" stroke={M} strokeWidth="26" strokeDasharray={`${b-2} ${L}`} strokeDashoffset={-a-1} transform="rotate(-90)" />
        <circle r={r} fill="none" stroke={C} strokeWidth="26" strokeDasharray={`${L-a-b-4} ${L}`} strokeDashoffset={-a-b-2} transform="rotate(-90)" />
        {Array.from({ length: 60 }, (_, i) => (
          <line key={i} y1={-122} y2={i % 5 ? -126 : -132} stroke="rgba(255,255,255,.25)" transform={`rotate(${i * 6})`} />
        ))}
        <text textAnchor="middle" y="-4" fill="#e8e9f0" fontSize="40" fontWeight="700" fontFamily="JetBrains Mono">
          1B
        </text>
        <text textAnchor="middle" y="20" fill={DIM} fontSize="11" letterSpacing="3" fontFamily="JetBrains Mono">
          TICKR
        </text>
      </svg>
      <div>
        <h3>{t.supply.title}</h3>
        <div className="tot">{t.supply.total}</div>
        <div className="bars">
          <div className="row" style={{ ["--k" as string]: Y }}>
            <span>{t.supply.drop}</span>
            <div className="track">
              <i style={{ width: `${(drop / 1e9) * 100}%` }} />
            </div>
            <b>
              {compact(drop)} · {pct(drop/1000,3)}
            </b>
          </div>
          <div className="row" style={{ ["--k" as string]: M }}><span>{t.supply.referral}</span><div className="track"><i style={{width:`${referral/1e7}%`}}/></div><b>{compact(referral)} · {pct(referral/1000,3)}</b></div>
          <div className="row" style={{ ["--k" as string]: C }}>
            <span>{t.supply.lp}</span>
            <div className="track">
              <i style={{ width: `${(lp / 1e9) * 100}%` }} />
            </div>
            <b>
              {compact(lp)} · {pct(lp/1000,3)}
            </b>
          </div>
          <div className="row" style={{ ["--k" as string]: M }}>
            <span>{tx("Fee")}</span>
            <div className="track">
              <i style={{ width: "3%" }} />
            </div>
            <b>{t.supply.tax}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
