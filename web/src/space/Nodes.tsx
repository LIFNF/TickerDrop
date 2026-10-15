import { useEffect, useState } from "react";
import { DROP, live, SUPPLY, TOP } from "../chain/config";
import { hms, nextOpen } from "../lib/clock";
import { t } from "../lib/copy";
import type { State, Ticker } from "../lib/data";
import { eth, tkn } from "../lib/format";
import { gainPct, type Board } from "../lib/session";
import { useWallet } from "../lib/wallet";
import type { Focus } from "./draw";
import { NODES, type NodeId } from "./layout";

const sp = t.space;

export function Countdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="mono">{hms(nextOpen(now) - now)}</span>;
}

function Dial({ size = 120 }: { size?: number }) {
  return (
    <svg className="dial" viewBox="-50 -50 100 100" width={size} height={size}>
      <circle r="46" fill="#07080d" stroke="#ffd400" strokeOpacity=".6" />
      {Array.from({ length: 60 }, (_, i) => (
        <line key={i} y1="-43" y2={i % 5 ? "-40" : "-35"} stroke={i % 15 ? "rgba(255,255,255,.3)" : "#ffd400"} transform={`rotate(${i * 6})`} />
      ))}
      <line y2="-30" stroke="#ffd400" strokeWidth="2.5" transform="rotate(180)" />
      <line y2="-20" stroke="#fff" strokeWidth="3" transform="rotate(285)" />
      <circle r="3" fill="#ffd400" />
    </svg>
  );
}

function Ring({ part }: { part: number }) {
  const r = 34;
  const L = 2 * Math.PI * r;
  return (
    <svg viewBox="-45 -45 90 90" width="96" height="96">
      <circle r={r} fill="none" stroke="rgba(0,240,255,.8)" strokeWidth="10" />
      <circle r={r} fill="none" stroke="#ffd400" strokeWidth="10" strokeDasharray={`${part * L} ${L}`} transform="rotate(-90)" />
      <text textAnchor="middle" y="5" fill="#e8e9f0" fontSize="15" fontWeight="700" fontFamily="JetBrains Mono">
        1B
      </text>
    </svg>
  );
}

type Props = { tickers: Ticker[]; state: State; board?: Board; focus: Focus; onOpen(id: NodeId): void };

export function Nodes({ tickers, state, board, focus, onOpen }: Props) {
  const { account } = useWallet();
  const floor = state.book.reduce<bigint | undefined>((m, a) => (m === undefined || a.price < m ? a.price : m), undefined);
  const drop = (SUPPLY * DROP) / 1e9;
  const eligible = state.mine.length > 0 && state.tickr >= 10n ** 18n;

  const body: Record<NodeId, React.ReactNode> = {
    core: (
      <>
        <div className="die" />
        <b className="big y">GAINPOOL</b>
        <small>{sp.core.sub}</small>
        <div className="pot">
          <div>
            <span>{sp.core.eth}</span>
            <b>{live ? eth(state.pot.eth) : "—"}</b>
          </div>
          <div>
            <span>{sp.core.tkn}</span>
            <b>{live ? tkn(state.pot.tkn) : "—"}</b>
          </div>
        </div>
        <div className="next">
          {sp.core.next} · 09:30 NY · <Countdown />
        </div>
      </>
    ),
    tickr: (
      <div className="split">
        <Ring part={drop} />
        <div>
          <b className="big c">TICKR</b>
          <small>{sp.tickr.sub}</small>
          <p className="line">
            <i className="dot c" />
            {sp.tickr.fee}
          </p>
          <p className="line dim">
            {(drop * 100).toFixed(2)}% {sp.tickr.drop} · {((1 - drop) * 100).toFixed(2)}% {sp.tickr.lp}
          </p>
        </div>
      </div>
    ),
    nft: (
      <>
        <b className="big m">NFT BOOK</b>
        <small>{sp.nft.sub}</small>
        <p className="line">
          <i className="dot m" />
          {sp.nft.fee}
        </p>
        <div className="pair">
          <div>
            <b>{state.book.length}</b>
            <span>{sp.nft.asks}</span>
          </div>
          <div>
            <b>{floor === undefined ? "—" : eth(floor, 5)}</b>
            <span>{sp.nft.floor} ETH</span>
          </div>
        </div>
      </>
    ),
    mint: (
      <>
        <div className="row">
          <b className="big">MINT</b>
          <span className="chip" style={{ color: live && state.phase === 1 ? "var(--g)" : "var(--m)" }}>
            {t.mint.phase[live ? state.phase : 0]}
          </span>
        </div>
        <small>{sp.mint.sub}</small>
        <div className="cols">
          {t.mint.tiers.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="bar">
          <i style={{ width: `${(state.minted / SUPPLY) * 100}%` }} />
        </div>
        <span className="mono dim">
          {state.minted} / {SUPPLY} · #1–#{TOP} first
        </span>
      </>
    ),
    clock: (
      <>
        <div className="split">
          <Dial size={104} />
          <div>
            <b className="big y">09:30</b>
            <small>America/New_York</small>
            <p className="line dim">
              {sp.clock.in} <Countdown />
            </p>
          </div>
        </div>
        <ul className="steps">
          {sp.clock.rows.map(([a, b]) => (
            <li key={a}>
              <b>{a}</b>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </>
    ),
    board: board ? (
      <>
        <div className="row">
          <b className="big">{board.date}</b>
          <span className="mono dim">16:00 NY</span>
        </div>
        <ol className="picks">
          {board.picks.slice(0, 7).map((p) => (
            <li key={p.id}>
              <b>{tickers[p.id - 1]?.s}</b>
              <span className="track">
                <i style={{ width: `${Math.min(100, (p.weight / 1e6) * 100)}%` }} className={p.weight < p.gain ? "cut" : ""} />
              </span>
              <span className="y">{gainPct(p.gain, 1)}</span>
              <span className="dim">{(p.share * 100).toFixed(1)}%</span>
            </li>
          ))}
          {board.picks.length > 7 && <li className="dim more">+{board.picks.length - 7}</li>}
        </ol>
        <div className="sum">
          <span>
            <b className="y">{board.green}</b> {sp.board.green}
          </span>
          <span>
            <b className="c">{board.red}</b> {sp.board.red}
          </span>
          <span>
            {sp.board.sum} <b>{((board.sum / 1e6) * 100).toFixed(0)}%</b>
          </span>
        </div>
      </>
    ) : (
      <>
        <b className="big">—</b>
        <p className="line dim">{sp.board.wait}</p>
      </>
    ),
    holder: (
      <>
        <b className="big">HOLDER</b>
        <small>{sp.holder.sub}</small>
        <p className="line">
          <i className="dot y" />
          {sp.holder.gets}
        </p>
        {account ? (
          <div className="pair">
            <div>
              <b>{state.mine.length}</b>
              <span>{sp.holder.cards}</span>
            </div>
            <div>
              <b className={eligible ? "ok" : "no"}>{eligible ? sp.holder.ok : sp.holder.no}</b>
              <span>{eth(state.credit, 5)} ETH {sp.holder.claim}</span>
            </div>
          </div>
        ) : (
          <p className="line dim">{sp.holder.connect}</p>
        )}
      </>
    ),
  };

  return (
    <>
      {NODES.map((b) => (
        <button
          key={b.id}
          type="button"
          data-node={b.id}
          className={`node n-${b.id}${focus?.kind === "node" && focus.id === b.id ? " on" : ""}`}
          style={{ left: b.x, top: b.y, width: b.w, minHeight: b.h }}
          onClick={(e) => e.detail === 0 && onOpen(b.id)}
        >
          <span className="pin">{sp.pins[b.id]}</span>
          {body[b.id]}
        </button>
      ))}
    </>
  );
}
