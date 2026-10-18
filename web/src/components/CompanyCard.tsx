import type { CSSProperties } from "react";
import type { Ticker } from "../lib/data";
import { compact } from "../lib/format";
import {tx} from "../lib/copy";

const palettes = ["#9ee86f", "#81b8ff", "#e5a8ff", "#ffad77", "#79e0d4", "#f0d68a"];
const identities: Record<string, [string, string, number]> = {
  NVDA: ["#a7ed64", "PARALLEL COMPUTE", 0], AAPL: ["#d0dbeb", "PRECISION SYSTEMS", 1],
  GOOG: ["#8ab4ff", "CONNECTED INTELLIGENCE", 2], GOOGL: ["#8ab4ff", "CONNECTED INTELLIGENCE", 2],
  MSFT: ["#80c8ff", "CLOUD ARCHITECTURE", 3], AMZN: ["#ffbb70", "GLOBAL INFRASTRUCTURE", 2],
  META: ["#83a7ff", "IMMERSIVE NETWORKS", 1], AVGO: ["#ff899b", "SILICON FABRIC", 0],
  TSLA: ["#ff8d8d", "ELECTRIC FRONTIER", 3], AMD: ["#ffae8c", "HIGH PERFORMANCE", 0],
  MU: ["#9abfff", "MEMORY ARCHITECTURE", 0], INTC: ["#70d2ff", "SILICON ARCHITECTURE", 0],
  ASML: ["#a5adff", "LIGHT & LITHOGRAPHY", 1], ARM: ["#83e3dd", "COMPUTE FOUNDATION", 0],
  NFLX: ["#ff7487", "SIGNAL & STORIES", 3], PLTR: ["#e0e6ee", "DATA CONSTELLATION", 2],
  CSCO: ["#7ad8eb", "NETWORK FABRIC", 2], PANW: ["#ffb18b", "SECURITY PERIMETER", 3],
  CRWD: ["#ff8a9e", "THREAT INTELLIGENCE", 2],
};
function seed(s: string) { return [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); }
export function identity(tk: Ticker) {
  const n = seed(tk.s);
  return identities[tk.s] ?? [palettes[n % palettes.length], "MARKET SIGNAL / " + tk.s, n % 4] as [string, string, number];
}

/** Original schematic illustrations, not official company logos. */
export function CompanyArt({ ticker }: { ticker: Ticker }) {
  const [color, label, mode] = identity(ticker);
  const caption=label.startsWith("MARKET SIGNAL / ")?`${tx("MARKET SIGNAL")} / ${ticker.s}`:tx(label);
  const n = seed(ticker.s);
  return <span className="company-art" style={{ "--art": color } as CSSProperties}>
    <svg viewBox="0 0 320 190" fill="none" aria-hidden="true">
      <path d="M16 30V14H32M288 14H304V30M16 160V176H32M288 176H304V160" stroke="currentColor" opacity=".5" />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${40 + i * 30} 24V166M24 ${30 + i * 16}H296`} stroke="currentColor" opacity=".055" />)}
      <g stroke="currentColor">
      {mode === 0 && <>
        <path d="M160 30 228 69 160 109 92 69Z" fill="currentColor" fillOpacity=".1" />
        {[0, 14, 28].map(y => <path key={y} d={`M92 ${69+y} 160 ${109+y} 228 ${69+y}M92 ${69+y}V${81+y}L160 ${121+y} 228 ${81+y}V${69+y}`} opacity={1-y/45} />)}
        <path d="M128 69 160 50 192 69 160 88Z" fill="currentColor" fillOpacity=".25" />
        {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${101+i*10} ${113+i*6}v12l-20 12M${219-i*10} ${113+i*6}v12l20 12`} opacity=".5" />)}
        <path d="M144 69h32m-16-10v20" />
      </>}
      {mode === 1 && <>
        {[0, 60, 120].map(a => <ellipse key={a} cx="160" cy="96" rx="78" ry="28" transform={`rotate(${a} 160 96)`} opacity=".7" />)}
        <circle cx="160" cy="96" r="17" fill="currentColor" fillOpacity=".15" />
        <path d="m160 82 12 7v14l-12 7-12-7V89Z" />
        <circle cx="229" cy="83" r="4" fill="currentColor" />
        <circle cx="121" cy="37" r="3" fill="currentColor" />
      </>}
      {mode === 2 && <>
        {Array.from({ length: 8 }, (_, i) => {
          const a = i * Math.PI / 4 + (n % 10) / 20;
          const x = 160 + Math.cos(a) * (i % 2 ? 66 : 81), y = 96 + Math.sin(a) * 65;
          return <g key={i}><path d={`M160 96 ${x} ${y} ${160+Math.cos(a+.8)*66} ${96+Math.sin(a+.8)*65}`} opacity=".4" /><circle cx={x} cy={y} r={i % 2 ? 5 : 8} fill="currentColor" fillOpacity=".16" /><circle cx={x} cy={y} r="2" fill="currentColor" /></g>;
        })}
        <path d="m160 74 20 11v22l-20 11-20-11V85Z" fill="currentColor" fillOpacity=".15" />
        <circle cx="160" cy="96" r="6" fill="currentColor" />
      </>}
      {mode === 3 && <>
        {[0,1,2,3,4].map(i => <g key={i}><path d={`M${92+i*28} 144V${74-(i%3)*16}l14-8 14 8V144l-14 8Z`} fill="currentColor" fillOpacity={.04+i*.025} /><path d={`m${92+i*28} ${74-(i%3)*16} 14 8 14-8m-14 8V152`} opacity=".6" /></g>)}
        <path d="m80 61 52-26 36 12 50-22M218 25v15m0-15h-15" strokeWidth="1.5" />
      </>}
      </g>
      <text x="27" y="35" fill="currentColor" opacity=".55" fontSize="8" fontFamily="monospace">{ticker.s} / {String(n % 65536).padStart(5, "0")}</text>
      <text x="293" y="163" textAnchor="end" fill="currentColor" opacity=".55" fontSize="8" fontFamily="monospace">FIG. {String(ticker.id).padStart(4, "0")}</text>
    </svg>
    <span className="art-caption">{caption}</span>
  </span>;
}

// Small original pixel emblems; schematic decoration, not price charts or official logos.
function CardEmblem({ symbol, mode }: { symbol: string; mode: number }) {
  const paths: Record<string, string> = {
    AAPL: "M17 7V3h4v4h-4M10 9h5v2h4V9h5v3h3v5h-3v5h3v3h-3v4h-6v-2h-3v2H9v-4H6V14h2v-3h2Z",
    MSFT: "M4 4h10v10H4ZM18 4h10v10H18ZM4 18h10v10H4ZM18 18h10v10H18Z",
    META: "M3 21V11h3V8h5v3h3v4h4v-4h3V8h5v3h3v10h-3v3h-5v-3h-3v-4h-4v4h-3v3H6v-3Zm4-9v8h4v-5H9v-3Zm14 3v5h4v-8h-2v3Z",
    TSLA: "M9 8h14v3h3v7h3v8h-5v-3H8v3H3v-8h3v-7h3Zm2 3v5h10v-5ZM6 19v2h4v-2Zm16 0v2h4v-2Z",
    SPCX: "M14 2h4v4h4v12h-3v5h-6v-5h-3V6h4ZM7 15h3v9H4v-5h3Zm15 0h3v4h3v5h-6Zm-8 10h4v5h-4ZM14 9v5h4V9Z",
    AMZN: "M5 8h22v17H5Zm2 2v13h18V10ZM14 8h4v8h-4ZM8 27h16v2H8Z",
    NFLX: "M8 4h5l6 14V4h5v24h-5l-6-14v14H8Z",
    GOOG: "M10 4h14v4H10ZM6 8h4v16H6Zm4 16h14v4H10Zm12-8h6v8h-4v-4h-7v-4Z",
    GOOGL: "M10 4h14v4H10ZM6 8h4v16H6Zm4 16h14v4H10Zm12-8h6v8h-4v-4h-7v-4Z",
  };
  const defaults = [
    "M8 8h16v16H8ZM11 11v10h10V11ZM3 10h4v3H3Zm0 8h4v3H3Zm22-8h4v3h-4Zm0 8h4v3h-4ZM10 3h3v4h-3Zm8 0h3v4h-3Zm-8 22h3v4h-3Zm8 0h3v4h-3Z",
    "M14 2h4v6h-4ZM2 14h6v4H2Zm22 0h6v4h-6ZM14 24h4v6h-4ZM10 10h12v12H10Zm3 3v6h6v-6Z",
    "M3 3h7v7H3Zm19 0h7v7h-7ZM3 22h7v7H3Zm19 0h7v7h-7ZM13 13h6v6h-6ZM9 7h4v4h3v3h-3v-3H9Zm10 0h4v4h-3v3h-3v-3h2ZM9 21h4v-3h3v3h-3v4H9Zm10-3h3v3h3v4h-4v-4h-2Z",
    "M4 16h6v12H4ZM13 10h6v18h-6ZM22 4h6v24h-6ZM4 30h24v2H4Z",
  ];
  return <svg className="card-emblem" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true"><path d={paths[symbol] ?? defaults[mode]} fill="currentColor" fillRule="evenodd" /></svg>;
}
export function CompanyFace({ ticker, status }: { ticker: Ticker; status: "owned"|"minted"|"selected"|"available" }) {
  const [accent, concept, mode] = identity(ticker);
  const caption=tx(concept.split(" / ")[0]);
  return <span className="company-face" style={{ "--art": accent } as CSSProperties}>
    <span className="card-circuit" aria-hidden="true" />
    <CardEmblem symbol={ticker.s} mode={mode} />
    <span className="compact-head"><span className="company-mark" aria-hidden="true">{ticker.s.slice(0, 1)}</span><strong>{ticker.s}</strong><span className="compact-rank">#{ticker.id}</span></span>
    <span className="compact-name">{ticker.n}</span>
    <span className="compact-meta"><span title={tx("Market cap from the collection dataset")}>${compact(ticker.cap)}</span><span>{ticker.id <= 100 ? "0.005" : "0.001"} ETH</span></span>
    <span className="compact-footer"><span className="compact-state">{status==="available"?(ticker.id<=100?tx("TOP 100"):"NASDAQ"):tx(status==="owned"?"Owned":status==="minted"?"Minted":"Selected ✓")}</span><span className="card-concept" title={caption}>{caption}</span><span className="card-edition">1/1</span></span>
  </span>;
}
