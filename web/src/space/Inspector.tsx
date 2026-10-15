import { useMemo, type ReactNode } from "react";
import { addr, dropAbi, live, PRICE, TOP, TOP_PRICE } from "../chain/config";
import { Contracts } from "../components/Chrome";
import { t } from "../lib/copy";
import type { State, Ticker } from "../lib/data";
import { compact, eth } from "../lib/format";
import { boardOf, gainPct, type Board, type Session } from "../lib/session";
import { useWallet } from "../lib/wallet";
import type { Focus } from "./draw";

const k = t.space.tk;

type CardProps = { id: number; tickers: Ticker[]; state: State; sessions: Session[]; board?: Board; onFocus(f: Focus): void };

function TickerCard({ id, tickers, state, sessions, board, onFocus }: CardProps) {
  const { send } = useWallet();
  const tk = tickers[id - 1];
  const last = sessions[0];
  const g = last?.gains[id - 1];
  const pick = board?.picks.find((p) => p.id === id);
  const ask = state.book.find((a) => a.id === id);
  const mine = state.mine.includes(id);
  const taken = state.taken.has(id);
  const price = state.free ? 0n : id <= TOP ? TOP_PRICE : PRICE;

  const rank = useMemo(() => {
    if (!last || g === null || g === undefined) return 0;
    let r = 1;
    last.gains.forEach((x, i) => {
      if (x !== null && (x > g || (x === g && i < id - 1))) r++;
    });
    return r;
  }, [last, g, id]);

  const history = useMemo(
    () =>
      sessions
        .slice(0, 10)
        .map((s) => ({ date: s.date, g: s.gains[id - 1], paid: boardOf(s).picks.some((p) => p.id === id) }))
        .reverse(),
    [sessions, id],
  );
  const peak = Math.max(1, ...history.map((h) => Math.abs(h.g ?? 0)));

  if (!tk) return null;

  const status = mine ? k.yours : ask ? `${k.listed} · ${eth(ask.price, 5)} ETH` : taken ? k.taken : k.free;
  const mint = () =>
    send(`MINT ${tk.s}`, (w, a) =>
      w.writeContract({ account: a, chain: w.chain, address: addr.drop, abi: dropAbi, functionName: "mint", args: [[BigInt(id)]], value: price }),
    );
  const buy = () =>
    ask &&
    send(`BUY ${tk.s}`, (w, a) =>
      w.writeContract({ account: a, chain: w.chain, address: addr.drop, abi: dropAbi, functionName: "buy", args: [BigInt(id)], value: ask.price }),
    );

  const near = [id - 2, id - 1, id + 1, id + 2].filter((n) => n >= 1 && n <= tickers.length);
  const peers = (board?.picks ?? []).filter((p) => p.id !== id).slice(0, 8);

  return (
    <div className="tkc">
      <div className="tk-head">
        <span className="mono dim">#{id}</span>
        <h2 className={id <= TOP ? "y" : ""}>{tk.s}</h2>
        {id <= TOP && <span className="chip y">TOP 100</span>}
      </div>
      <p className="tk-name">{tk.n}</p>

      <div className="kvs">
        <div>
          <span>{k.cap}</span>
          <b>${compact(tk.cap)}</b>
        </div>
        <div>
          <span>{k.price}</span>
          <b>{eth(price)} ETH</b>
        </div>
        <div>
          <span>{k.drop}</span>
          <b className="c">+100,000 TICKR</b>
        </div>
        <div>
          <span>{k.status}</span>
          <b className={mine ? "ok" : ""}>{live ? status : "—"}</b>
        </div>
      </div>

      <div className="tk-acts">
        {live && !taken && (
          <button className="btn" disabled={state.phase !== 1} onClick={mint}>
            {k.mint} · {eth(price)} ETH
          </button>
        )}
        {live && ask && !mine && (
          <button className="btn m" onClick={buy}>
            {k.buy} · {eth(ask.price, 5)} ETH
          </button>
        )}
      </div>

      <h4>
        {k.last} {last ? `· ${last.date}` : ""}
      </h4>
      {g === undefined ? (
        <p className="dim">{t.space.board.wait}</p>
      ) : g === null ? (
        <p className="dim">{k.none}</p>
      ) : (
        <div className="day">
          <b className={`gain ${g > 0 ? "y" : "c"}`}>{gainPct(g)}</b>
          <div className="kvs">
            <div>
              <span>{k.rank}</span>
              <b>
                {rank} / {last!.gains.filter((x) => x !== null).length}
              </b>
            </div>
            {pick ? (
              <>
                <div>
                  <span>{k.weight}</span>
                  <b className={pick.weight < pick.gain ? "m" : "y"}>{gainPct(pick.weight)}</b>
                </div>
                <div>
                  <span>{k.share}</span>
                  <b className="y">{(pick.share * 100).toFixed(2)}%</b>
                </div>
              </>
            ) : null}
          </div>
          <p className={pick ? "y" : "dim"}>{pick ? (pick.weight < pick.gain ? `${k.paid} · ${k.clipped}` : k.paid) : g > 0 ? k.out : k.red}</p>
        </div>
      )}

      {history.length > 1 && (
        <>
          <h4>{k.history}</h4>
          <div className="spark">
            {history.map((h) => (
              <div key={h.date} title={`${h.date} ${h.g === null || h.g === undefined ? "—" : gainPct(h.g)}`}>
                <i
                  className={(h.g ?? 0) > 0 ? (h.paid ? "paid" : "up") : "dn"}
                  style={{ height: `${Math.max(2, (Math.abs(h.g ?? 0) / peak) * 100)}%` }}
                />
                <span>{h.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h4>{k.near}</h4>
      <div className="links">
        {near.map((n) => (
          <button key={n} onClick={() => onFocus({ kind: "tk", id: n })}>
            <span>#{n}</span> {tickers[n - 1]?.s}
          </button>
        ))}
      </div>

      {peers.length > 0 && (
        <>
          <h4>{k.peers}</h4>
          <div className="links">
            {peers.map((p) => (
              <button key={p.id} onClick={() => onFocus({ kind: "tk", id: p.id })}>
                {tickers[p.id - 1]?.s} <em>{gainPct(p.gain, 1)}</em>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Props = CardProps & { open: boolean; title: string; onClose(): void; children?: ReactNode; ticker?: boolean };

export function Inspector({ open, title, onClose, children, ticker, ...card }: Props) {
  return (
    <aside className={`sheet${open ? " open" : ""}${ticker ? " narrow" : ""}`} aria-hidden={!open}>
      <div className="sheet-bar">
        <span>{title}</span>
        <button onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {ticker ? <TickerCard {...card} /> : children}
        {open && <Contracts />}
      </div>
    </aside>
  );
}
