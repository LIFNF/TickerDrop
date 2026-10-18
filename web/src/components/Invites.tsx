import {useState} from "react";
import {useInvites} from "../lib/invites";
import {useWallet} from "../lib/wallet";
import {formatUnits} from "viem";
import {tx} from "../lib/copy";
import {numberLocale} from "../lib/locale";

export function Invites(){
 const invite=useInvites();const {account}=useWallet();const [copied,setCopied]=useState("");
 const copy=async()=>{try{await navigator.clipboard.writeText(invite.own);setCopied(invite.own);}catch{setCopied("");}};
 return <div className="invite-box">
  <div><strong>{tx("Direct mint slots · {count}/50",{count:invite.seeds})}</strong><p>{tx("First 50 minting wallets: no code required. After that, each code admits 3 wallets.")}</p><p>{tx("Referral reward: 15,000 TICKR per NFT, paid separately.")}</p></div>
  {account&&invite.own&&<div className="invite-own">
   <span>{tx("My invitation code")}</span><code>{invite.own}</code>
   <span>{tx("Places remaining {count}/3",{count:3-invite.uses})}</span><button className="btn ghost sm" onClick={copy}>{tx(copied===invite.own?"Copied":"Copy")}</button>
  </div>}
  {account&&!invite.own&&invite.seeds>=50&&<p>{tx("All direct mint slots are taken. Enter an invitation code.")}</p>}
  {invite.registered&&<p>{tx("Total rewards {amount} TICKR",{amount:Number(formatUnits(invite.earned,18)).toLocaleString(numberLocale())})}</p>}
  {invite.seeds>=50&&!invite.own&&<label className="invite-input">{tx("Invitation code")}
   <input aria-label={tx("Invitation code")} autoComplete="off" spellCheck={false} maxLength={5} placeholder={tx("5 letters or digits")} value={invite.input} onChange={e=>invite.setInput(e.target.value)} disabled={!account}/>
  </label>}
  <p role="status">{invite.message}</p>
 </div>;
}
