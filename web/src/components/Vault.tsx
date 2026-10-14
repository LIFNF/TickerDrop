import { Fragment, useState } from "react";
import { addr, poolAbi } from "../chain/config";
import { winners, type Round, type State, type Ticker } from "../lib/data";
import { dayStr, eth, pct, tkn } from "../lib/format";
import { t } from "../lib/copy";
import { useWallet } from "../lib/wallet";

type Win = Awaited<ReturnType<typeof winners>>;

export function Vault({ tickers, state }: { tickers: Ticker[]; state: State }) {
  const v = t.vault;
  const { account, send, connect } = useWallet();
  const [open, setOpen] = useState<number>();
  const [wins, setWins] = useState<Record<number, Win>>({});

  const expand = (r: Round) => {
    setOpen((o) => (o === r.day ? undefined : r.day));
    if (!wins[r.day]) winners(r).then((w) => setWins((all) => ({ ...all, [r.day]: w })));
  };

  const claim = () =>
    send("CLAIM", (w, a) => w.writeContract({ account: a, chain: w.chain, address: addr.pool, abi: poolAbi, functionName: "claim" }));

  const eligible = state.mine.length > 0 && state.tickr >= 10n ** 18n;

  return (
    <section className="block wrap rv" id="vault">
      <div className="sh">
        <span className="idx">05</span>
        <h2>{v.title}</h2>
      </div>

      <div className="meters">
        <div className="panel meter">
          <small>{v.potEth}</small>
          <b>{eth(state.pot.eth)}</b>
          <div className="fins" />
        </div>
        <div className="panel meter">
          <small>{v.potTkn}</small>
          <b>{tkn(state.pot.tkn)}</b>
          <div className="fins" />
        </div>
        <div className="panel meter">
          <small>{v.rounds}</small>
          <b>{state.roundCount}</b>
          <div className="fins" />
        </div>
      </div>

      <div className="two">
        <div className="panel">
          <h3>SETTLEMENTS</h3>
          {state.rounds.length === 0 ? (
            <div className="emptyrow">{v.empty}</div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    {v.cols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.rounds.map((r) => (
                    <Fragment key={r.day}>
                      <tr onClick={() => r.paid > 0 && expand(r)} style={{ cursor: r.paid ? "pointer" : undefined }}>
                        <td>{dayStr(r.day)}</td>
                        <td>{r.gainers}</td>
                        <td className={r.paid ? "y" : ""}>{r.paid}</td>
                        <td>{pct(r.weight, 1)}</td>
                        <td>{eth(r.eth)}</td>
                        <td>{tkn(r.tkn)}</td>
                      </tr>
                      {open === r.day && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="wins">
                              {(wins[r.day] || []).map((w) => (
                                <span key={w.id}>
                                  <b>{tickers[w.id - 1]?.s}</b> +{pct(w.gain)} · {eth(w.eth)} ETH · {tkn(w.tkn)}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>{v.me}</h3>
          {!account ? (
            <div className="emptyrow">
              <p style={{ margin: "0 0 14px" }}>{v.connect}</p>
              <button className="btn c sm" onClick={connect}>
                {t.connect}
              </button>
            </div>
          ) : (
            <div className="me">
              <div className="kv">
                <span>{v.cards}</span>
                <b>{state.mine.length}</b>
              </div>
              <div className="kv">
                <span>{v.bal}</span>
                <b>{tkn(state.tickr)}</b>
              </div>
              <div className="kv">
                <span>STATUS</span>
                <b className={eligible ? "ok" : "no"}>{eligible ? v.ok : v.no}</b>
              </div>
              <div className="kv">
                <span>{v.credit}</span>
                <b>{eth(state.credit, 6)}</b>
              </div>
              <button className="btn" disabled={state.credit === 0n} onClick={claim}>
                {v.claim}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
