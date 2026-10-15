import { useState } from "react";
import { parseEther } from "viem";
import { addr, dropAbi, explorer, live } from "../chain/config";
import type { State, Ticker } from "../lib/data";
import { eth, short } from "../lib/format";
import { t } from "../lib/copy";
import { useWallet } from "../lib/wallet";

export function Book({ tickers, state }: { tickers: Ticker[]; state: State }) {
  const b = t.book;
  const { account, send, connect } = useWallet();
  const [prices, setPrices] = useState<Record<number, string>>({});

  const asks = [...state.book].sort((x, y) => (x.price < y.price ? -1 : x.price > y.price ? 1 : x.id - y.id));
  const askOf = new Map(state.book.map((a) => [a.id, a]));
  const me = account?.toLowerCase();

  const buy = (id: number, price: bigint) =>
    send(`BUY #${id}`, (w, a) => w.writeContract({ account: a, chain: w.chain, address: addr.drop, abi: dropAbi, functionName: "buy", args: [BigInt(id)], value: price }));

  const list = (id: number) => {
    let v: bigint;
    try {
      v = parseEther((prices[id] || "").trim());
    } catch {
      return;
    }
    if (v <= 0n) return;
    send(`LIST #${id}`, (w, a) => w.writeContract({ account: a, chain: w.chain, address: addr.drop, abi: dropAbi, functionName: "list", args: [BigInt(id), v] }));
  };

  const unlist = (id: number) =>
    send(`CANCEL #${id}`, (w, a) => w.writeContract({ account: a, chain: w.chain, address: addr.drop, abi: dropAbi, functionName: "unlist", args: [BigInt(id)] }));

  return (
    <section className="mod" id="book">
      <div className="sh">
        <span className="idx">04</span>
        <h2>{b.title}</h2>
        <p>{b.lead}</p>
      </div>

      <div className="two">
        <div className="panel">
          <h3>ASKS · {asks.length}</h3>
          <div className="scroll">
            {asks.length === 0 ? (
              <div className="emptyrow">{b.empty}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    {b.cols.map((c, i) => (
                      <th key={i}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {asks.map((a) => (
                    <tr key={a.id}>
                      <td>#{a.id}</td>
                      <td className={a.id <= 100 ? "y" : ""}>{tickers[a.id - 1]?.s}</td>
                      <td>{eth(a.price, 5)} ETH</td>
                      <td>
                        {explorer ? (
                          <a href={`${explorer}/address/${a.seller}`} target="_blank" rel="noreferrer">
                            {short(a.seller)}
                          </a>
                        ) : (
                          short(a.seller)
                        )}
                      </td>
                      <td className="r">
                        {a.seller.toLowerCase() === me ? (
                          <span style={{ color: "var(--dim)", fontSize: 11 }}>{b.yours}</span>
                        ) : (
                          <button className="btn sm" disabled={!live} onClick={() => buy(a.id, a.price)}>
                            {b.buy}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <h3>
            {b.mine} · {state.mine.length}
          </h3>
          {!account ? (
            <div className="emptyrow">
              <button className="btn c sm" onClick={connect}>
                {t.connect}
              </button>
            </div>
          ) : state.mine.length === 0 ? (
            <div className="emptyrow">{b.none}</div>
          ) : (
            <div className="mine scroll">
              {state.mine.map((id) => {
                const ask = askOf.get(id);
                return (
                  <div className="it" key={id}>
                    <span>
                      <b style={{ color: id <= 100 ? "var(--y)" : undefined }}>{tickers[id - 1]?.s}</b> <small>#{id}</small>
                      {ask && <small style={{ display: "block", color: "var(--c)" }}>{eth(ask.price, 5)} ETH</small>}
                    </span>
                    {ask ? (
                      <span />
                    ) : (
                      <input
                        inputMode="decimal"
                        placeholder={b.price}
                        value={prices[id] || ""}
                        onChange={(e) => setPrices((p) => ({ ...p, [id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      />
                    )}
                    {ask ? (
                      <button className="btn ghost m sm" onClick={() => unlist(id)}>
                        {b.unlist}
                      </button>
                    ) : (
                      <button className="btn ghost sm" disabled={!prices[id]} onClick={() => list(id)}>
                        {b.list}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
