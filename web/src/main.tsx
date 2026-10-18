import { StrictMode,useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {ErrorBoundary,DataHealth} from "./components/Resilience";
import { WalletConnection } from "./components/WalletConnection";
import { InviteProvider } from "./lib/invites";
import {useLanguage} from "./lib/locale";
import {tx} from "./lib/copy";
import "./styles.css";

function LocalizedApp(){
 const language=useLanguage();
 useEffect(()=>{
  document.title=tx("TickerDrop — Nasdaq on Robinhood Chain");
  const description=tx("3,172 company NFTs. Trading fees are distributed according to closing gains and on-chain eligibility.");
  document.querySelector('meta[name="description"]')?.setAttribute("content",description);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content",description);
 },[language]);
 return (
    <ErrorBoundary><WalletConnection>
      <InviteProvider><App /><DataHealth /></InviteProvider>
    </WalletConnection></ErrorBoundary>
 );
}
createRoot(document.getElementById("root")!).render(<StrictMode><LocalizedApp /></StrictMode>);
