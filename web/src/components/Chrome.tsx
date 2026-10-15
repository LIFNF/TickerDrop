import { addr, chain, explorer, live } from "../chain/config";
import { short } from "../lib/format";
import { t } from "../lib/copy";
import { useWallet } from "../lib/wallet";

export function Contracts() {
  const link = (a: string) => (explorer && live ? `${explorer}/address/${a}` : undefined);
  return (
    <footer className="foot">
      <div>
        <h5>{t.foot.contracts}</h5>
        {(
          [
            ["TICKERDROP", addr.drop],
            ["TICKR", addr.tickr],
            ["GAINPOOL", addr.pool],
          ] as const
        ).map(([k, a]) => (
          <a key={k} href={link(a)} target="_blank" rel="noreferrer">
            <span>{k}</span>
            {live ? short(a) : "—"}
          </a>
        ))}
      </div>
      <div>
        <h5>{t.foot.chain}</h5>
        <a href={explorer || undefined} target="_blank" rel="noreferrer">
          {chain.name} · {chain.id}
        </a>
        <a>Close 16:00 · Settle 09:30 · America/New_York</a>
      </div>
      <div>
        <h5>{t.foot.source}</h5>
        <a href="https://github.com/LIFNF/TickerDrop" target="_blank" rel="noreferrer">
          github.com/LIFNF/TickerDrop
        </a>
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
