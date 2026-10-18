import { chain, explorer, live } from "../chain/config";
import { t,tx } from "../lib/copy";
import { useWallet } from "../lib/wallet";

export function Contracts() {
 return <footer className="foot"><div><h5>{t.foot.chain}</h5><span>{chain.name}</span><span>09:30 · America/New_York</span></div><div><h5>{tx("Status")}</h5><span>{live?tx("Wallet connection available"):t.offline}</span></div></footer>;
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
              {tx("Transaction")} ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
