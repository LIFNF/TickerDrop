import { useDeferredValue, useMemo, useState } from "react";
import { addr, dropAbi, live, PRICE, SUPPLY, TOP, TOP_PRICE } from "../chain/config";
import type { State, Ticker } from "../lib/data";
import { compact, eth } from "../lib/format";
import { useT } from "../lib/i18n";
import { useWallet } from "../lib/wallet";

const MAX = 100;

export function Mint({ tickers, state }: { tickers: Ticker[]; state: State }) {
  const { t } = useT();
  const m = t.mint;
  const { send } = useWallet();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(0);
  const [sel, setSel] = useState<number[]>([]);
  const query = useDeferredValue(q.trim().toUpperCase());

  const mine = useMemo(() => new Set(state.mine), [state.mine]);

  const shown = useMemo(() => {
    return tickers.filter((tk) => {
      if (filter === 1 && tk.id > TOP) return false;
      if (filter === 2 && state.taken.has(tk.id)) return false;
      if (filter === 3 && !state.taken.has(tk.id)) return false;
      if (!query) return true;
      return tk.s.startsWith(query) || tk.n.toUpperCase().includes(query) || String(tk.id) === query;
    });
  }, [tickers, filter, query, state.taken]);

  const cost = state.free ? 0n : sel.reduce((s, id) => s + (id <= TOP ? TOP_PRICE : PRICE), 0n);
  const open = live && state.phase === 1;

  const toggle = (id: number) => {
    if (state.taken.has(id)) return;
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]));
  };

  const mint = async () => {
    const ids = [...sel].sort((a, b) => a - b).map(BigInt);
    const ok = await send(`MINT ×${ids.length}`, (w, a) =>
      w.writeContract({ account: a, chain: w.chain, address: addr.drop, abi: dropAbi, functionName: "mint", args: [ids], value: cost }),
    );
    if (ok) setSel([]);
  };

  const pct = (state.minted / SUPPLY) * 100;

  return (
    <section className="block wrap rv" id="mint">
      <div className="sh">
        <span className="idx">03</span>
        <h2>{m.title}</h2>
        <p>{m.lead}</p>
      </div>

      <div className="tiers">
        {m.tiers.map(([k, v, s]) => (
          <div className="panel" key={k}>
            <small>{k}</small>
            <b>{v}</b>
            <span>{s}</span>
          </div>
        ))}
      </div>

      <div className="route">
        <span>{m.route}</span>
        <code>{addr.lp}</code>
        <span className="wl">● {m.wl}</span>
      </div>

      <div className="panel mintbox">
        <div className="progress">
          <span className="chip" style={{ color: open ? "var(--g)" : "var(--m)" }}>
            {m.phase[live ? state.phase : 0]}
          </span>
          <div className="track">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span>
            {m.minted} {state.minted} / {SUPPLY}
          </span>
        </div>

        <div className="mint-top">
          <input className="search" placeholder={m.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tabs">
            {m.filters.map((name, i) => (
              <button key={name} className={filter === i ? "on" : ""} onClick={() => setFilter(i)}>
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid">
          {shown.map((tk) => {
            const taken = state.taken.has(tk.id);
            const cls = ["cell", tk.id <= TOP && "top", taken && "taken", mine.has(tk.id) && "own", sel.includes(tk.id) && "sel"].filter(Boolean).join(" ");
            return (
              <button key={tk.id} className={cls} onClick={() => toggle(tk.id)} title={`${tk.n} · $${compact(tk.cap)}`}>
                <span className="r">#{tk.id}</span>
                <span className="s">{tk.s}</span>
                <span className="n">{tk.n}</span>
              </button>
            );
          })}
        </div>

        <div className="tray">
          <div className="picked">
            <span className="mono" style={{ color: "var(--dim)", fontSize: 12 }}>
              {m.picked} {sel.length}/{MAX}
            </span>
            {sel.slice(0, 18).map((id) => (
              <span className="tag" key={id} onClick={() => toggle(id)}>
                {tickers[id - 1]?.s} ×
              </span>
            ))}
            {sel.length > 18 && <span className="tag">+{sel.length - 18}</span>}
          </div>
          <div className="sum">
            {m.total}
            <b>{eth(cost)} ETH</b>
            <div style={{ fontSize: 11 }}>+{(sel.length * 100_000).toLocaleString()} TICKR</div>
          </div>
          {sel.length > 0 && (
            <button className="btn ghost sm" onClick={() => setSel([])}>
              {m.clear}
            </button>
          )}
          <button className="btn" disabled={!open || sel.length === 0} onClick={mint}>
            {m.go}
          </button>
        </div>
        {state.free && (
          <p className="mono" style={{ color: "var(--g)", fontSize: 12, margin: "12px 0 0" }}>
            ● {m.wl}
          </p>
        )}
      </div>
    </section>
  );
}
