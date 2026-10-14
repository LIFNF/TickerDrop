import { addr, chain, explorer, live } from "../chain/config";
import { short } from "../lib/format";
import { t } from "../lib/copy";
import { useWallet } from "../lib/wallet";

export function Nav() {
  const { account, connect, wrongChain } = useWallet();
  return (
    <div className="nav">
      <div className="wrap">
        <a className="logo" href="#">
          <i />
          TICKERDROP
        </a>
        <nav>
          {(Object.keys(t.nav) as (keyof typeof t.nav)[]).map((k) => (
            <a key={k} href={`#${k}`}>
              {t.nav[k]}
            </a>
          ))}
        </nav>
        {!live && <span className="chip">{t.offline}</span>}
        <button className={`btn sm ${account ? "ghost c" : ""}`} onClick={connect}>
          {account ? (wrongChain ? t.wrongChain : short(account)) : t.connect}
        </button>
      </div>
    </div>
  );
}

export function Footer() {
  const link = (a: string) => (explorer && live ? `${explorer}/address/${a}` : undefined);
  return (
    <footer>
      <div className="wrap">
        <div>
          <h5>{t.foot.contracts}</h5>
          {(
            [
              ["TICKERDROP", addr.drop],
              ["TICKR", addr.tickr],
              ["GAINPOOL", addr.pool],
              ["LP", addr.lp],
            ] as const
          ).map(([k, a]) => (
            <a key={k} href={link(a)} target="_blank" rel="noreferrer">
              {k.padEnd(11, "\u00a0")}
              {live || k === "LP" ? short(a) : "—"}
            </a>
          ))}
        </div>
        <div>
          <h5>{t.foot.chain}</h5>
          <a href={explorer || undefined} target="_blank" rel="noreferrer">
            {chain.name} · {chain.id}
          </a>
          <a>16:00 America/New_York</a>
        </div>
        <div>
          <h5>{t.foot.source}</h5>
          <a href="https://github.com/LIFNF/TickerDrop" target="_blank" rel="noreferrer">
            github.com/LIFNF/TickerDrop
          </a>
        </div>
        <div className="big">TICKERDROP</div>
      </div>
    </footer>
  );
}

export function Toasts() {
  const { toasts } = useWallet();
  return (
    <div className="toasts">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>
          {x.text}
          {x.hash && explorer && (
            <a href={`${explorer}/tx/${x.hash}`} target="_blank" rel="noreferrer">
              tx ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
