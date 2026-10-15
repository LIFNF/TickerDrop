type Tone = "blue" | "red";

const LED: Record<Tone, { hot: string; mid: string; deep: string }> = {
  blue: { hot: "#bff8ff", mid: "#00e1ff", deep: "#0057ff" },
  red: { hot: "#ffd0d4", mid: "#ff2a3c", deep: "#a3001a" },
};

// one blade, hub at the origin
const BLADE = "M0-27C10-48 30-72 58-86C76-95 94-92 104-80C84-78 64-66 50-50C38-37 22-30 6-26Z";
const BODY = "M30 14H650L676 40V246L656 266H52L30 244Z";
const FANS = [196, 504];
const FY = 140;
const FS = 0.9;

// blades live in their own element so the spin stays on the compositor
// instead of repainting the whole filtered card every frame
function Blades({ id, cx, spin }: { id: string; cx: number; spin: number }) {
  const s = 224 * FS;
  return (
    <svg
      className="blades"
      viewBox="-112 -112 224 224"
      style={{
        left: `${((cx - s / 2) / 700) * 100}%`,
        top: `${((FY - s / 2) / 310) * 100}%`,
        width: `${(s / 700) * 100}%`,
        height: `${(s / 310) * 100}%`,
        animationDuration: `${spin}s`,
      }}
    >
      <clipPath id={`${id}-${cx}-cut`}>
        <circle r="110" />
      </clipPath>
      <g clipPath={`url(#${id}-${cx}-cut)`}>
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={BLADE} transform={`rotate(${i * 40})`} fill={`url(#${id}-blade)`} stroke="rgba(255,255,255,.14)" strokeWidth=".8" />
        ))}
      </g>
    </svg>
  );
}

export function Gpu({ tone, name, model }: { tone: Tone; name: string; model: string }) {
  const c = LED[tone];
  const id = `gpu-${tone}`;
  return (
    <div className="gpu" aria-hidden>
      <svg className="base" viewBox="0 0 700 310">
        <defs>
          <linearGradient id={`${id}-shroud`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a3e46" />
            <stop offset=".08" stopColor="#1b1d22" />
            <stop offset=".55" stopColor="#0d0e11" />
            <stop offset="1" stopColor="#1a1c21" />
          </linearGradient>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2f4f7" />
            <stop offset=".25" stopColor="#8b9099" />
            <stop offset=".5" stopColor="#e3e6ea" />
            <stop offset=".75" stopColor="#5d626b" />
            <stop offset="1" stopColor="#c7ccd3" />
          </linearGradient>
          <linearGradient id={`${id}-blade`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a2d34" stopOpacity=".96" />
            <stop offset="1" stopColor="#0a0b0e" stopOpacity=".9" />
          </linearGradient>
          <radialGradient id={`${id}-wash`}>
            <stop offset=".25" stopColor="#020203" />
            <stop offset=".78" stopColor={c.deep} stopOpacity=".55" />
            <stop offset=".96" stopColor={c.mid} stopOpacity=".95" />
            <stop offset="1" stopColor={c.hot} />
          </radialGradient>
          <pattern id={`${id}-fins`} width="5" height="8" patternUnits="userSpaceOnUse">
            <rect width="2" height="8" fill="#000" />
            <rect x="2" width="1" height="8" fill="rgba(255,255,255,.1)" />
          </pattern>
          <linearGradient id={`${id}-au`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9a3" />
            <stop offset=".5" stopColor="#d4a43a" />
            <stop offset="1" stopColor="#8a6418" />
          </linearGradient>
          <pattern id={`${id}-gold`} width="9" height="24" patternUnits="userSpaceOnUse">
            <rect x="1" width="6" height="24" fill={`url(#${id}-au)`} />
          </pattern>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id={`${id}-clip`}>
            <path d={BODY} />
          </clipPath>
        </defs>

        {/* PCIe fingers */}
        <path d="M150 262h300v26h-300z" fill="#0d3b2a" />
        <rect x="154" y="264" width="62" height="24" fill={`url(#${id}-gold)`} />
        <rect x="226" y="264" width="220" height="24" fill={`url(#${id}-gold)`} />

        {/* I/O bracket */}
        <path d="M2 4h22v290l-8 12H2z" fill={`url(#${id}-metal)`} />
        {[30, 74, 118, 162].map((y) => (
          <rect key={y} x="7" y={y} width="12" height="32" rx="2" fill="#0b0c0f" stroke="#5d626b" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x="9" y={204 + i * 10} width="8" height="4" fill="#2a2d33" />
        ))}

        {/* shroud */}
        <path d={BODY} fill={`url(#${id}-shroud)`} />
        <rect x="28" y="14" width="650" height="252" fill={`url(#${id}-fins)`} opacity=".22" clipPath={`url(#${id}-clip)`} />
        <path d={BODY} fill="none" stroke={`url(#${id}-metal)`} strokeWidth="5" />
        <path d="M44 28H640L662 50V236L646 252H60L44 236Z" fill="none" stroke="rgba(255,255,255,.07)" />

        {/* center spine */}
        <path d="M336 30h28v220h-28z" fill="#08090b" stroke={`url(#${id}-metal)`} strokeWidth="2" />
        <rect x="347" y="46" width="6" height="188" fill={c.mid} filter={`url(#${id}-glow)`} />

        {/* LED wash seen through the blades */}
        {FANS.map((cx) => (
          <g key={cx} transform={`translate(${cx} ${FY}) scale(${FS})`}>
            <circle r="112" fill={`url(#${id}-wash)`} />
            <circle r="112" fill={`url(#${id}-fins)`} opacity=".55" />
          </g>
        ))}

        {/* power connector */}
        <rect x="560" y="2" width="56" height="14" fill="#0b0c0f" stroke="#5d626b" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={565 + i * 6.3} y="6" width="3" height="6" fill={i % 2 ? "#2b2e35" : c.mid} opacity=".8" />
        ))}

        {[
          [44, 28],
          [662, 50],
          [60, 240],
          [646, 240],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="3.2" fill="#14161a" stroke={`url(#${id}-metal)`} />
        ))}

        <text x="64" y="260" fill={c.hot} fontSize="11" fontFamily="JetBrains Mono" letterSpacing="5" filter={`url(#${id}-glow)`}>
          {name}
        </text>
        <text x="636" y="260" fill="rgba(255,255,255,.55)" fontSize="10" fontFamily="JetBrains Mono" letterSpacing="3" textAnchor="end">
          {model}
        </text>
      </svg>

      {FANS.map((cx, i) => (
        <Blades key={cx} id={id} cx={cx} spin={(tone === "blue") === (i === 0) ? 1.1 : 1.25} />
      ))}

      {/* frame rings, LED rings, struts, hubs: above the blades */}
      <svg className="rim" viewBox="0 0 700 310">
        {FANS.map((cx) => (
          <g key={cx} transform={`translate(${cx} ${FY}) scale(${FS})`}>
            <circle r="117" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="7" />
            <circle r="111" fill="none" stroke={c.mid} strokeWidth="5" filter={`url(#${id}-glow)`} />
            <circle r="111" fill="none" stroke={c.hot} strokeWidth="1.2" />
            {[45, 165, 285].map((a) => (
              <rect key={a} x="-2" y="-112" width="4" height="80" fill="#0b0c0f" transform={`rotate(${a})`} />
            ))}
            <circle r="34" fill="#0b0c10" stroke={`url(#${id}-metal)`} strokeWidth="3" />
            <circle r="24" fill="none" stroke={c.mid} strokeWidth="1.5" opacity=".9" filter={`url(#${id}-glow)`} />
            <path d="M-12-10h24v6h-9v18h-6v-18h-9z" fill={c.hot} filter={`url(#${id}-glow)`} />
          </g>
        ))}
      </svg>

      <i className="sheen" />
    </div>
  );
}
