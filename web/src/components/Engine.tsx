import { useT } from "../lib/i18n";
import { SUPPLY, DROP } from "../chain/config";

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

function Node({ x, y, w, h, title, sub, color }: { x: number; y: number; w: number; h: number; title: string; sub?: string; color: string }) {
  return (
    <g>
      <path d={`M${x} ${y}h${w - 12}l12 12v${h - 12}h${-w + 12}l-12 -12z`} fill="#0b0d16" stroke={color} strokeOpacity=".7" />
      <rect x={x} y={y + 14} width="3" height={h - 28} fill={color} />
      <text x={x + 20} y={y + (sub ? h / 2 - 2 : h / 2 + 5)} fill="#e8e9f0" fontSize="15" fontWeight="700" letterSpacing="1.5">
        {title}
      </text>
      {sub && (
        <text x={x + 20} y={y + h / 2 + 18} fill={DIM} fontSize="11" letterSpacing="1">
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

export function Engine() {
  const { t } = useT();
  const e = t.engine;
  const pA = "M290 115 H380 C430 115 430 170 480 170";
  const pB = "M290 295 H380 C430 295 430 250 480 250";
  const pOut = "M730 210 H860";
  const pHold = "M1010 350 V392";
  const pRoll = "M880 350 C 860 420 660 410 620 340";
  const pMint = "M290 500 H480";
  const pDrop = "M165 530 C 165 560 260 556 860 556";

  return (
    <section className="block wrap rv" id="engine">
      <div className="sh">
        <span className="idx">01</span>
        <h2>{e.title}</h2>
        <p>{e.lead}</p>
      </div>

      <div className="panel flow" style={{ padding: "26px 20px 18px" }}>
        <svg viewBox="20 30 1160 545">
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

          <Node x={40} y={70} w={250} h={90} title={e.tickr} sub="PAIR ⇄ WALLET" color={C} />
          <Node x={40} y={250} w={250} h={90} title={e.nft} sub="buy(id) · ROYALTY" color={M} />

          <path className="wire" d={pA} stroke={C} strokeOpacity=".35" />
          <path className="run" d={pA} stroke={C} />
          <path className="wire" d={pB} stroke={M} strokeOpacity=".35" />
          <path className="run" d={pB} stroke={M} />
          <text x="300" y="104" fill={C} fontSize="12">
            {e.inTkn}
          </text>
          <text x="300" y="324" fill={M} fontSize="12">
            {e.inEth}
          </text>
          <Packet path={pA} color={C} dur={2.2} />
          <Packet path={pA} color={C} dur={2.2} delay={1.1} />
          <Packet path={pB} color={M} dur={2.6} delay={0.4} />

          <Chip />

          <path className="wire" d={pOut} stroke={Y} strokeOpacity=".4" />
          <path className="run" d={pOut} stroke={Y} />
          <Packet path={pOut} color={Y} dur={1.6} />

          <g transform="translate(795 128)">
            <circle r="30" fill="#0b0d16" stroke={Y} strokeOpacity=".7" />
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} y1="-26" y2={i % 3 ? "-23" : "-20"} stroke="rgba(255,255,255,.4)" transform={`rotate(${i * 30})`} />
            ))}
            <line y2="-18" stroke={Y} strokeWidth="2" transform="rotate(120)" />
            <line y2="-12" stroke="#fff" strokeWidth="2" />
            <line y1="30" y2="82" stroke={Y} strokeDasharray="2 4" />
            <text y="-40" textAnchor="middle" fill={Y} fontSize="12" letterSpacing="1.5">
              {e.clock}
            </text>
          </g>

          <Board label={e.board} out={t.cutoff.out} clip={t.cutoff.clip} />

          <path className="wire" d={pHold} stroke={Y} strokeOpacity=".5" />
          <Packet path={pHold} color={Y} dur={1.2} delay={0.6} />
          <g>
            <path d="M860 392h300v52l-12 12h-288z" fill="#0b0d16" stroke={Y} strokeOpacity=".7" />
            <text x="878" y="420" fill="#e8e9f0" fontSize="15" fontWeight="700" letterSpacing="1.5">
              {e.holder.toUpperCase()}
            </text>
            <text x="878" y="440" fill={DIM} fontSize="11">
              CARD + {e.hold}
            </text>
            <text x="1142" y="420" fill={M} fontSize="12" textAnchor="end">
              ETH
            </text>
            <text x="1142" y="440" fill={C} fontSize="12" textAnchor="end">
              TICKR
            </text>
          </g>

          <path d={pRoll} fill="none" stroke="rgba(255,255,255,.3)" strokeDasharray="3 5" />
          <path d="M616 352l4-12 7 10" fill="none" stroke="rgba(255,255,255,.45)" />
          <text x="740" y="412" fill={DIM} fontSize="11" textAnchor="middle" letterSpacing="1">
            {e.roll}
          </text>

          <line x1="40" x2="1160" y1="462" y2="462" stroke="rgba(255,255,255,.07)" />
          <Node x={40} y={474} w={250} h={56} title={e.mintEth} color={Y} />
          <path className="wire" d={pMint} stroke={Y} strokeOpacity=".4" />
          <path className="run" d={pMint} stroke={Y} />
          <Packet path={pMint} color={Y} dur={1.8} />
          <g>
            <path d="M480 474h228l12 12v44h-240z" fill="#0b0d16" stroke="rgba(255,255,255,.25)" />
            <text x="498" y="498" fill="#e8e9f0" fontSize="13" fontWeight="700" letterSpacing="1">
              {e.lp.toUpperCase()}
            </text>
            <text x="498" y="517" fill={DIM} fontSize="11">
              0x175d…B0dd
            </text>
          </g>
          <path d={pDrop} fill="none" stroke={C} strokeOpacity=".45" strokeDasharray="4 6" />
          <Packet path={pDrop} color={C} dur={3} delay={0.5} />
          <text x="1160" y="548" fill={C} fontSize="12" textAnchor="end">
            {e.drop}
          </text>
        </svg>
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
  const { t } = useT();
  const drop = SUPPLY * DROP;
  const lp = 1e9 - drop;
  const r = 100;
  const L = 2 * Math.PI * r;
  const a = (drop / 1e9) * L;
  return (
    <div className="panel supply">
      <svg viewBox="-140 -140 280 280">
        <circle r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="26" />
        <circle r={r} fill="none" stroke={Y} strokeWidth="26" strokeDasharray={`${a} ${L}`} transform="rotate(-90)" />
        <circle r={r} fill="none" stroke={C} strokeWidth="26" strokeDasharray={`${L - a - 4} ${L}`} strokeDashoffset={-a - 2} transform="rotate(-90)" />
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
              {(drop / 1e6).toFixed(1)}M · {((drop / 1e9) * 100).toFixed(2)}%
            </b>
          </div>
          <div className="row" style={{ ["--k" as string]: C }}>
            <span>{t.supply.lp}</span>
            <div className="track">
              <i style={{ width: `${(lp / 1e9) * 100}%` }} />
            </div>
            <b>
              {(lp / 1e6).toFixed(1)}M · {((lp / 1e9) * 100).toFixed(2)}%
            </b>
          </div>
          <div className="row" style={{ ["--k" as string]: M }}>
            <span>FEE</span>
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
