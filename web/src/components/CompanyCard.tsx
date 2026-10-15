import type { CSSProperties } from "react";
import type { Ticker } from "../lib/data";
import { compact } from "../lib/format";

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
    <span className="art-caption">{label}</span>
  </span>;
}

export function CompanyFace({ ticker, status }: { ticker: Ticker; status: string }) {
  const [accent] = identity(ticker);
  return <span className="company-face" style={{ "--art": accent } as CSSProperties}>
    <span className="compact-head"><span className="company-mark" aria-hidden="true">{ticker.s.slice(0, 1)}</span><strong>{ticker.s}</strong><span className="compact-rank">#{ticker.id}</span></span>
    <span className="compact-name">{ticker.n}</span>
    <span className="compact-meta"><span title="Market cap from the collection dataset">${compact(ticker.cap)}</span><span>{ticker.id <= 100 ? "0.005" : "0.001"} ETH</span></span>
    <span className="compact-state">{status === "SELECT +" ? (ticker.id <= 100 ? "TOP 100" : "NASDAQ") : status}</span>
  </span>;
}