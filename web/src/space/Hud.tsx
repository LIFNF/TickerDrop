import { useEffect, useMemo, useRef, useState } from "react";
import { live } from "../chain/config";
import { t } from "../lib/copy";
import type { Ticker } from "../lib/data";
import { short } from "../lib/format";
import { useWallet } from "../lib/wallet";
import type { Camera, Rect } from "./camera";
import { thumb, type Paint } from "./draw";
import { WORLD, type NodeId } from "./layout";

const sp = t.space;

export const NAV: [keyof typeof t.nav, NodeId][] = [
  ["engine", "core"],
  ["cutoff", "board"],
  ["mint", "mint"],
  ["book", "nft"],
  ["vault", "holder"],
];

function useZoom(cam: Camera) {
  const [k, setK] = useState(cam.k);
  useEffect(() => {
    let raf = 0;
    return cam.on(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setK(cam.k));
    });
  }, [cam]);
  return k;
}

function Search({ tickers, onPick }: { tickers: Ticker[]; onPick(id: number): void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return [];
    const exact = tickers.filter((x) => x.s.startsWith(s));
    const named = tickers.filter((x) => !x.s.startsWith(s) && (x.n.toUpperCase().includes(s) || String(x.id) === s));
    return [...exact, ...named].slice(0, 8);
  }, [q, tickers]);

  const pick = (id: number) => {
    onPick(id);
    setQ("");
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="find">
      <input
        value={q}
        placeholder={sp.find}
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setSel((i) => Math.min(hits.length - 1, i + 1));
          else if (e.key === "ArrowUp") setSel((i) => Math.max(0, i - 1));
          else if (e.key === "Enter" && hits[sel]) pick(hits[sel].id);
          else if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          else return;
          e.preventDefault();
        }}
      />
      {open && hits.length > 0 && (
        <ul>
          {hits.map((x, i) => (
            <li key={x.id} className={i === sel ? "on" : ""} onMouseDown={() => pick(x.id)} onMouseEnter={() => setSel(i)}>
              <span>#{x.id}</span>
              <b className={x.id <= 100 ? "y" : ""}>{x.s}</b>
              <small>{x.n}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TopProps = { tickers: Ticker[]; active?: NodeId; onNav(id: NodeId): void; onHome(): void; onFind(id: number): void };

export function Top({ tickers, active, onNav, onHome, onFind }: TopProps) {
  const { account, connect, wrongChain } = useWallet();
  return (
    <header className="top">
      <button className="logo" onClick={onHome} title={sp.home}>
        <i />
        TICKERDROP
      </button>
      <nav>
        {NAV.map(([k, id]) => (
          <button key={k} className={active === id ? "on" : ""} onClick={() => onNav(id)}>
            {t.nav[k]}
          </button>
        ))}
      </nav>
      <Search tickers={tickers} onPick={onFind} />
      {!live && <span className="chip off">{t.offline}</span>}
      <button className={`btn sm ${account ? "ghost c" : ""}`} onClick={connect}>
        {account ? (wrongChain ? t.wrongChain : short(account)) : t.connect}
      </button>
    </header>
  );
}

export function Zoom({ cam, onHome, view }: { cam: Camera; onHome(): void; view(): Rect }) {
  const k = useZoom(cam);
  const at = (f: number) => {
    const v = view();
    cam.zoomAt(v.x + v.w / 2, v.y + v.h / 2, f);
  };
  return (
    <div className="zoom">
      <button onClick={() => at(1 / 1.4)} aria-label="zoom out">
        −
      </button>
      <span className="mono">{Math.round(k * 100)}%</span>
      <button onClick={() => at(1.4)} aria-label="zoom in">
        +
      </button>
      <button onClick={onHome} aria-label={sp.fit} title={sp.fit}>
        ⌖
      </button>
    </div>
  );
}

export function MiniMap({ cam, paint, view }: { cam: Camera; paint: Paint; view(): Rect }) {
  const base = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = 200;
  const H = Math.round((W * WORLD.h) / WORLD.w);

  useEffect(() => {
    if (base.current) thumb(base.current, paint, WORLD);
  }, [paint]);

  useEffect(() => {
    const s = W / WORLD.w;
    const draw = () => {
      const v = view();
      const a = cam.toWorld(v.x, v.y);
      const b = cam.toWorld(v.x + v.w, v.y + v.h);
      const el = box.current;
      if (!el) return;
      const x = Math.max(0, (a.x - WORLD.x) * s);
      const y = Math.max(0, (a.y - WORLD.y) * s);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${Math.max(4, Math.min(W, (b.x - WORLD.x) * s) - x)}px`;
      el.style.height = `${Math.max(4, Math.min(H, (b.y - WORLD.y) * s) - y)}px`;
    };
    draw();
    return cam.on(draw);
  }, [cam, view, H]);

  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    const wx = WORLD.x + ((e.clientX - r.left) / W) * WORLD.w;
    const wy = WORLD.y + ((e.clientY - r.top) / H) * WORLD.h;
    const v = view();
    cam.set(v.x + v.w / 2 - wx * cam.k, v.y + v.h / 2 - wy * cam.k, cam.k);
  };

  return (
    <div className="mini" style={{ width: W, height: H }} onPointerDown={jump} onPointerMove={jump}>
      <canvas ref={base} width={W * 2} height={H * 2} style={{ width: W, height: H }} />
      <div className="vp" ref={box} />
    </div>
  );
}

export function Hint({ gone }: { gone: boolean }) {
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  return (
    <div className={`hint${gone ? " gone" : ""}`}>
      {(touch ? sp.touch : sp.hint).map((x) => (
        <span key={x}>{x}</span>
      ))}
    </div>
  );
}

export function Intro({ show, onEnter, onMint }: { show: boolean; onEnter(): void; onMint(): void }) {
  const h = t.hero;
  return (
    <div className={`intro${show ? "" : " gone"}`}>
      <div className="kicker">{h.kicker}</div>
      <h1 data-t="TICKERDROP">
        <span>TICKERDROP</span>
      </h1>
      <p className="lines">
        {h.line1}
        <br />
        <b>{h.line2}</b>
      </p>
      <div className="stats">
        {h.stats.map(([k, v]) => (
          <div key={k}>
            <b>{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="acts">
        <button className="btn" onClick={onEnter}>
          {sp.enter} →
        </button>
        <button className="btn ghost" onClick={onMint}>
          {t.nav.mint}
        </button>
      </div>
    </div>
  );
}
