import { useEffect, useState } from "react";
import { DROP, live, SUPPLY, TOP,REFERRAL_DROP } from "../chain/config";
import { hms, nextOpen } from "../lib/clock";
import { t,tx } from "../lib/copy";
import type { State, Ticker } from "../lib/data";
import { eth, tkn } from "../lib/format";
import { gainPct, type Board } from "../lib/session";
import { useWallet } from "../lib/wallet";
import type { Focus } from "./draw";
import { Gpu } from "./Gpu";
import {useReferenceQuotes} from '../lib/reference';
import {numberLocale} from '../lib/locale';
import { Clock, Die, Hardware } from "./sprites";
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

type Props = { tickers: Ticker[]; state: State; board?: Board; focus: Focus; onOpen(id: NodeId): void };

export function Nodes({ tickers, state, board, focus, onOpen }: Props) {
  const reference=useReferenceQuotes();
  const { account } = useWallet();
  const floor = state.book.reduce<bigint | undefined>((m, a) => (m === undefined || a.price < m ? a.price : m), undefined);
  const drop = (SUPPLY * DROP) / 1e9;
  const eligible = state.mine.length > 0 && state.tickr >= 10n ** 18n;

  const body: Record<NodeId, React.ReactNode> = {
    core: (
      <>
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
        <div className="next" title={tx("Market holidays are not included in this countdown. Settlement follows the oracle's confirmed session calendar.")}>
          {sp.core.next} · 09:30 NY · <Countdown />
        </div>
      </>
    ),
    tickr: (
      <>
        <Gpu tone="blue" />
        <div className="rigcap">
          <b className="big">TICKR</b>
          <span>{sp.tickr.fee}</span>
          <span className="dim">
            {(drop * 100).toFixed(2)}% {sp.tickr.drop} · {(SUPPLY*REFERRAL_DROP/1e7).toFixed(3)}% {sp.tickr.referral} · {((1-drop-SUPPLY*REFERRAL_DROP/1e9)*100).toFixed(3)}% {sp.tickr.lp}
          </span>
        </div>
      </>
    ),
    nft: (
      <>
        <Gpu tone="red" />
        <div className="rigcap">
          <b className="big">{sp.pins.nft}</b>
          <span>{sp.nft.fee}</span>
          <span className="dim">
            {state.book.length} {sp.nft.asks} · {sp.nft.floor} {floor === undefined ? "—" : `${eth(floor, 5)} ETH`}
          </span>
        </div>
      </>
    ),
    mint: (
      <>
        <div className="row">
          <b className="big">{sp.pins.mint}</b>
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
          {state.minted} / {SUPPLY} · #1–#{TOP}
        </span>
      </>
    ),
    clock: (
      <>
        <div className="split">
          <Clock size={104} />
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
          <span className="mono dim">{tx("Daily allocation")}</span>
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
          {board.allocationOnly ? <span>{tx("Selected NFTs")} <b>{board.picks.length}</b></span> : <>
          <span>
            <b className="y">{board.green}</b> {sp.board.green}
          </span>
          <span>
            <b className="c">{board.red}</b> {sp.board.red}
          </span>
          </>}
          <span>
            {sp.board.sum} <b>{((board.sum / 1e6) * 100).toFixed(0)}%</b>
          </span>
        </div>
      </>
    ) : reference ? (
      <>
        <div className="row"><b>{tx("Top movers")}</b><span className="quote-status">{tx("Delayed")}</span></div>
        <ol className="reference-prices">
          {[...reference.rows].sort((a,b)=>b.change-a.change||a.id-b.id).slice(0,5).map(q=><li key={q.id}><b>{q.s}</b><span>${q.price.toLocaleString(numberLocale(),{maximumFractionDigits:4})}</span><span className={q.change>=0?'y':'c'}>{q.change>0?'+':''}{q.change.toLocaleString(numberLocale(),{minimumFractionDigits:2,maximumFractionDigits:2})}%</span></li>)}
        </ol>
        <div className="quote-source"><span title={new Date(reference.capturedAt).toLocaleString(numberLocale())}>TradingView</span></div>
      </>
    ) : (
      <>
          <b>{tx("Top movers")}</b>
          <p className="line dim">{tx("Prices unavailable")}</p>
      </>
    ),
    holder: (
      <>
        <b className="big">{sp.pins.holder}</b>
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
              <b className={eligible ? "ok" : "no"}>{eligible ? tx("Minimum met") : tx("Below minimum")}</b>
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
          {b.id === "core" && <Die />}
          {(b.id === "mint" || b.id === "clock" || b.id === "board" || b.id === "holder") && <Hardware kind={b.id} />}
          {body[b.id]}
        </button>
      ))}
    </>
  );
}
