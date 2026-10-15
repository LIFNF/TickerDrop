import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Book } from "./components/Book";
import { Toasts } from "./components/Chrome";
import { Cutoff } from "./components/Cutoff";
import { Engine } from "./components/Engine";
import { Mint } from "./components/Mint";
import { Vault } from "./components/Vault";
import { t } from "./lib/copy";
import { useChainState, useTickers } from "./lib/data";
import { boardOf, useSessions } from "./lib/session";
import { Camera, type Rect } from "./space/camera";
import { bucketOf, type Focus, type Paint } from "./space/draw";
import { Hint, Intro, MiniMap, NAV, Top, Zoom } from "./space/Hud";
import { Inspector } from "./space/Inspector";
import { INNER, node, sky, WORLD } from "./space/layout";
import { Nodes } from "./space/Nodes";
import { Space } from "./space/Space";

const phone = () => window.innerWidth < 760;
const RIG = 1440;

// what the drawer leaves of the screen
function viewOf(focus: Focus): Rect {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const top = phone() ? 100 : 64;
  if (!focus) return { x: 0, y: top, w, h: h - top };
  if (phone()) return { x: 0, y: top, w, h: Math.max(120, h * (focus.kind === "tk" ? 0.42 : 0.3) - top) };
  const side = focus.kind === "tk" ? Math.min(440, Math.max(360, w * 0.3)) : Math.min(980, Math.max(440, w * 0.56));
  return { x: 0, y: top, w: w - side, h: h - top };
}

function homeView(cam: Camera, ms?: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // the rig is ~1500 tall; leave the inner ring of stars around it
  const rig = RIG + 60;
  if (phone()) {
    const k = Math.min((h * 0.5 - 100) / rig, w / (2 * INNER + 180));
    cam.fly(0, 0, k, w / 2, 100 + (h * 0.5 - 100) / 2 + 20, ms);
  } else {
    const side = Math.min(620, w * 0.44);
    const k = Math.min(((h - 64) * 0.82) / rig, (w - side - 40) / (2 * INNER - 120));
    cam.fly(0, 0, k, side + (w - side) / 2, 64 + (h - 64) / 2, ms);
  }
}

export default function App() {
  const tickers = useTickers();
  const state = useChainState();
  const sessions = useSessions();
  const cam = useMemo(() => new Camera(), []);
  const stars = useMemo(() => sky(tickers), [tickers]);
  const last = sessions[0];
  const board = useMemo(() => (last ? boardOf(last) : undefined), [last]);

  const [focus, setFocus] = useState<Focus>(null);
  const [intro, setIntro] = useState(true);
  const [touched, setTouched] = useState(false);
  const shown = useRef<Focus>(null);
  if (focus) shown.current = focus;

  const paint = useMemo<Paint>(() => {
    const n = stars.length;
    const bucket = new Uint8Array(n);
    const ring = new Uint8Array(n);
    const mine = new Set(state.mine);
    for (let i = 0; i < n; i++) {
      bucket[i] = bucketOf(last ? last.gains[i] : undefined, i < 100);
      ring[i] = mine.has(i + 1) ? 2 : state.taken.has(i + 1) ? 1 : 0;
    }
    const picks = board?.picks ?? [];
    return { stars, tickers, bucket, ring, picks, win: new Map(picks.map((p) => [p.id, p])), gains: last?.gains };
  }, [stars, tickers, last, board, state.mine, state.taken]);

  const go = useCallback(
    (f: Focus) => {
      setFocus(f);
      setTouched(true);
      if (!f) return;
      setIntro(false);
      const v = viewOf(f);
      if (f.kind === "node") cam.fit(node(f.id), v, phone() ? 16 : 60, 1.2);
      else {
        const s = stars[f.id - 1];
        if (s) cam.fly(s.x, s.y, Math.min(2.6, Math.max(cam.k, 1.8)), v.x + v.w / 2, v.y + v.h / 2);
      }
      const tag = f.kind === "node" ? NAV.find(([, id]) => id === f.id)?.[0] ?? f.id : `t/${tickers[f.id - 1]?.s ?? f.id}`;
      history.replaceState(null, "", `#${tag}`);
    },
    [cam, stars, tickers],
  );

  const close = useCallback(() => {
    setFocus(null);
    history.replaceState(null, "", location.pathname + location.search);
  }, []);

  const home = useCallback(() => {
    close();
    setIntro(true);
    homeView(cam);
  }, [cam, close]);

  const enter = useCallback(() => {
    setIntro(false);
    setTouched(true);
    cam.fit(WORLD, viewOf(null), phone() ? 10 : 40, 1);
  }, [cam]);

  // opening shot
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    cam.set(w / 2, h / 2, 0.05);
    homeView(cam, 1600);
  }, [cam]);

  // deep links: #mint, #t/NVDA
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !tickers.length) return;
    linked.current = true;
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    const nav = NAV.find(([k]) => k === h);
    if (nav) return void setTimeout(() => go({ kind: "node", id: nav[1] }), 400);
    const sym = h.startsWith("t/") ? h.slice(2).toUpperCase() : "";
    const tk = sym && tickers.find((x) => x.s === sym);
    if (tk) setTimeout(() => go({ kind: "tk", id: tk.id }), 400);
  }, [tickers, go]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      const v = viewOf(focus);
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      if (e.key === "Escape") close();
      else if (e.key === "+" || e.key === "=") cam.zoomAt(cx, cy, 1.4);
      else if (e.key === "-" || e.key === "_") cam.zoomAt(cx, cy, 1 / 1.4);
      else if (e.key === "0") home();
      else if (e.key === "ArrowLeft") cam.pan(120, 0);
      else if (e.key === "ArrowRight") cam.pan(-120, 0);
      else if (e.key === "ArrowUp") cam.pan(0, 120);
      else if (e.key === "ArrowDown") cam.pan(0, -120);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cam, focus, close, home]);

  const moved = useCallback(() => {
    setTouched(true);
    setIntro(false);
  }, []);
  const view = useCallback(() => viewOf(focus), [focus]);

  const f = shown.current;
  let title = "";
  let body = null;
  if (f?.kind === "node") {
    const mod = node(f.id).mod;
    const pin = t.space.pins[f.id];
    title = pin.toLowerCase().includes(t.nav[mod].toLowerCase()) ? pin : `${pin} · ${t.nav[mod]}`;
    body =
      mod === "engine" ? (
        <Engine />
      ) : mod === "cutoff" ? (
        <Cutoff tickers={tickers} />
      ) : mod === "mint" ? (
        <Mint tickers={tickers} state={state} />
      ) : mod === "book" ? (
        <Book tickers={tickers} state={state} />
      ) : (
        <Vault tickers={tickers} state={state} />
      );
  } else if (f?.kind === "tk") title = `#${f.id} · ${tickers[f.id - 1]?.s ?? ""}`;

  return (
    <>
      <Space cam={cam} paint={paint} focus={focus} onTap={(x) => (x ? go(x) : focus?.kind === "tk" && close())} onMove={moved}>
        <Nodes tickers={tickers} state={state} board={board} focus={focus} onOpen={(id) => go({ kind: "node", id })} />
      </Space>

      <Top
        tickers={tickers}
        active={focus?.kind === "node" ? focus.id : undefined}
        onNav={(id) => go({ kind: "node", id })}
        onHome={home}
        onFind={(id) => go({ kind: "tk", id })}
      />
      <Intro show={intro && !focus} onEnter={enter} onMint={() => go({ kind: "node", id: "mint" })} />
      <div className="dock">
        <Zoom cam={cam} onHome={home} view={view} />
        <Hint gone={touched} />
      </div>
      {paint.stars.length > 0 && <MiniMap cam={cam} paint={paint} view={view} />}

      <Inspector
        open={!!focus}
        ticker={f?.kind === "tk"}
        title={title}
        onClose={close}
        id={f?.kind === "tk" ? f.id : 0}
        tickers={tickers}
        state={state}
        sessions={sessions}
        board={board}
        onFocus={go}
      >
        {body}
      </Inspector>
      <Toasts />
    </>
  );
}
