import { useDeferredValue, useMemo, useState } from "react";
import { addr, live, PRICE, SUPPLY, TOP, TOP_PRICE } from "../chain/config";
import type { State, Ticker } from "../lib/data";
import { compact, eth } from "../lib/format";
import { t,tx } from "../lib/copy";
import {numberLocale} from "../lib/locale";
import { CompanyFace } from "./CompanyCard";
import { useWallet } from "../lib/wallet";
import {useInvites} from "../lib/invites";
import {Invites} from "./Invites";

const MAX = 100;

export function Mint({ tickers, state }: { tickers: Ticker[]; state: State }) {
  const m = t.mint;
  const { busy } = useWallet();
  const invite = useInvites();
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

  const selected = sel.filter(id => !state.taken.has(id));
  const cost = selected.reduce((s, id) => s + (id <= TOP ? TOP_PRICE : PRICE), 0n);
  const open = live && state.ready && state.phase === 1;

  const toggle = (id: number) => {
    if (state.taken.has(id)) return;
    setSel((s) => { const active=s.filter(x=>!state.taken.has(x)); return active.includes(id) ? active.filter(x=>x!==id) : active.length>=MAX ? active : [...active,id]; });
  };

  const mint = async () => {
    const ids = [...selected].sort((a, b) => a - b).map(BigInt);
    if (!ids.length) return;
    const ok = await invite.mint(ids,cost,`${m.go} ×${ids.length}`);
    if (ok) setSel([]);
  };

  const pct = (state.minted / SUPPLY) * 100;

  return (
    <section className="mod" id="mint">
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
        <code>{live ? addr.drop : m.tba}</code>
        <span className="wl">● {m.wl}</span>
      </div>

      <div className="panel mintbox">
        <Invites />
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

        <div className="asset-catalog"><span>{tx("{count} ASSETS / NASDAQ COLLECTION",{count:shown.length.toLocaleString(numberLocale())})}</span><span>{tx("01 / ORIGINAL SCHEMATICS")}</span></div>
        <div className="grid asset-grid">
          {shown.map((tk) => {
            const taken = state.taken.has(tk.id);
            const cls = ["cell", tk.id <= TOP && "premier", taken && "taken", mine.has(tk.id) && "own", selected.includes(tk.id) && "sel"].filter(Boolean).join(" ");
            return (
              <button key={tk.id} className={cls} onClick={() => toggle(tk.id)} aria-pressed={selected.includes(tk.id)} aria-disabled={taken} title={`${tk.n} · $${compact(tk.cap)}`}>
                <CompanyFace ticker={tk} status={mine.has(tk.id) ? "owned" : taken ? "minted" : selected.includes(tk.id) ? "selected" : "available"} />
              </button>
            );
          })}
        </div>

        <div className="tray">
          <div className="picked">
            <span className="mono" style={{ color: "var(--dim)", fontSize: 12 }}>
              {m.picked} {selected.length}/{MAX}
            </span>
            {selected.slice(0, 18).map((id) => (
              <span className="tag" key={id} onClick={() => toggle(id)}>
                {tickers[id - 1]?.s} ×
              </span>
            ))}
            {selected.length > 18 && <span className="tag">+{selected.length - 18}</span>}
          </div>
          <div className="sum">
            {m.total}
            <b>{eth(cost)} ETH</b>
            <div style={{ fontSize: 11 }}>+{(selected.length * 100_000).toLocaleString(numberLocale())} TICKR</div>
          </div>
          {sel.length > 0 && (
            <button className="btn ghost sm" onClick={() => setSel([])}>
              {m.clear}
            </button>
          )}
          <button className="btn" disabled={!open || selected.length === 0 || !invite.valid || busy} onClick={mint}>
            {m.go}
          </button>
        </div>
      </div>
    </section>
  );
}
