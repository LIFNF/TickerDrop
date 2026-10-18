import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {PrivyProvider,useConnectWallet,usePrivy,useWallets,type PrivyClientConfig,type ConnectedWallet} from "@privy-io/react-auth";
import type {Address,EIP1193Provider} from "viem";
import {chain} from "../chain/config";
import {useWallet,type WalletConnection as Connection} from "../lib/wallet";
import {useLanguage} from "../lib/locale";
import {tx} from "../lib/copy";
import {short} from "../lib/format";

// Public application identifier; no Privy server secret is used by the website.
export const PRIVY_APP_ID="cmvd5q0j302g60gkzx11ques3";
const selectionKey="tickerdrop:active-wallet:v1";
function remembered(){try{return localStorage.getItem(selectionKey)||"";}catch{return "";}}
const walletOptions:NonNullable<NonNullable<PrivyClientConfig["appearance"]>["walletList"]>=["detected_ethereum_wallets","metamask","coinbase_wallet","rainbow","okx_wallet","phantom","zerion","uniswap","bitget_wallet","binance","kraken_wallet","robinhood_wallet","wallet_connect"];
function localization():NonNullable<PrivyClientConfig["intl"]>["textLocalization"]{
 return {
  "connectWallet.connectYourWallet":tx("Connect a wallet"),"connectWallet.selectYourWallet":tx("Select your wallet"),
  "connectWallet.waitingForWallet":tx("Waiting for your wallet"),"connectWallet.connectToAccount":tx("Connect to your account"),
  "connectWallet.installAndConnect":tx("Install and connect"),"connectWallet.tryConnectingAgain":tx("Try again"),
  "connectWallet.openInApp":tx("Open in app"),"connectWallet.copyLink":tx("Copy link"),"connectWallet.retry":tx("Try again"),
  "connectWallet.searchPlaceholder":tx("Search wallets"),"connectWallet.noWalletsFound":tx("No wallets found"),
  "connectWallet.lastUsed":tx("Last used"),"connectWallet.selectNetwork":tx("Select network"),
  "connectWallet.goToWallet":tx("Open wallet"),"connectWallet.scanToConnect":tx("Scan to connect"),"connectWallet.openOrInstall":tx("Open or install"),
  "connectionStatus.successfullyConnected":tx("Connected to {walletName}"),"connectionStatus.errorTitle":tx("Connection failed"),
  "connectionStatus.connecting":tx("Connecting…"),"connectionStatus.connectOneWallet":tx("Select a wallet to continue"),
  "connectionStatus.checkOtherWindows":tx("Check your wallet window"),"connectionStatus.stillHere":tx("Still waiting?"),
  "connectionStatus.tryConnectingAgain":tx("Try again"),"connectionStatus.or":tx("or"),"connectionStatus.useDifferentLink":tx("Use another connection method"),
  "coinbaseWallet.connectingSubtitle":tx("Confirm the connection in Coinbase Wallet"),"coinbaseWallet.connectingSubtitleReset":tx("Reopen Coinbase Wallet to connect"),"coinbaseWallet.successSubtitle":tx("Wallet connected"),
 };
}
function Manager({open,onClose,wallets,selected,onSelect,onAdd,onDisconnect,error}:{open:boolean;onClose():void;wallets:ConnectedWallet[];selected?:ConnectedWallet;onSelect(wallet:ConnectedWallet):void;onAdd():void;onDisconnect():void;error:string}){
 const {busy,wrongChain}=useWallet();const dialog=useRef<HTMLDialogElement>(null),lastFocus=useRef<HTMLElement|null>(null);
 useEffect(()=>{const element=dialog.current!;if(open){lastFocus.current=document.activeElement as HTMLElement;element.showModal();}else if(element.open){element.close();lastFocus.current?.focus();}},[open]);
 return createPortal(<dialog ref={dialog} className="wallet-manager" aria-hidden={!open} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}} aria-labelledby="wallet-manager-title">
  <div className="wallet-manager-head"><span>01 / TICKERDROP</span><button className="wallet-close" aria-label={tx("Close")} disabled={busy} onClick={onClose}>×</button></div>
  <h2 id="wallet-manager-title">{tx("Your wallets")}</h2><p>{tx("Choose the wallet used for minting and transactions.")}</p>
  <div className="wallet-accounts">{wallets.map(wallet=><button className={`wallet-account${wallet===selected?" active":""}`} key={`${wallet.connectorType}:${wallet.walletClientType}:${wallet.address}`} disabled={busy} onClick={()=>onSelect(wallet)}><span className="wallet-pixel-icon" aria-hidden="true">▣</span><span><b>{wallet.meta.name}</b><code>{short(wallet.address)}</code></span><span className="wallet-account-state">{wallet===selected?tx("Active"):tx("Select")}</span></button>)}</div>
  {wrongChain&&<p className="wallet-notice">{tx("Network will switch to {network} before a transaction.",{network:chain.name})}</p>}
  {error&&<p role="alert" className="wallet-notice">{tx(error)}</p>}
  <button className="btn wallet-add" disabled={busy} onClick={onAdd}>＋ {tx("Connect another wallet")}</button>
  {selected&&<button className="wallet-disconnect" disabled={busy} onClick={onDisconnect}>{tx("Disconnect selected wallet")}</button>}
  <small>{tx("Connections are managed by Privy. Transactions require confirmation in your wallet.")}</small>
 </dialog>,document.body);
}
type BridgeProps={onConnection(connection:Connection):void;onSession(active:boolean):void;openRequest:number};
function Adapter({onConnection,onSession,openRequest}:BridgeProps){
 const {ready:privyReady,isModalOpen}=usePrivy();const {wallets,ready:walletsReady}=useWallets();
 const [chosen,setChosen]=useState(remembered),[open,setOpen]=useState(false),[error,setError]=useState("");
 const [resolved,setResolved]=useState<{key:string;provider:EIP1193Provider}>();
 const selected=chosen?wallets.find(wallet=>`${wallet.walletClientType}:${wallet.address.toLowerCase()}`===chosen):wallets[0];
 const selectedKey=selected?`${selected.walletClientType}:${selected.address.toLowerCase()}`:"";
 const choose=(wallet:Pick<ConnectedWallet,"walletClientType"|"address">)=>{const key=`${wallet.walletClientType}:${wallet.address.toLowerCase()}`;setChosen(key);setError("");try{localStorage.setItem(selectionKey,key);}catch{/* Selection still works in memory. */}};
 const {connectWallet}=useConnectWallet({onSuccess:({wallet})=>{choose(wallet);setOpen(false);},onError:()=>{setError("Wallet connection failed. Try again.");}});
 useEffect(()=>{
  let cancelled=false;let timer:number|undefined;
  if(!selectedKey||!walletsReady)return;
  const wallet=selected;
  const resolve=async(attempt:number)=>{
   try {const provider=await wallet!.getEthereumProvider();if(!cancelled){setResolved({key:selectedKey,provider:provider as EIP1193Provider});setError("");}}
   catch {if(!cancelled){if(attempt<3)timer=window.setTimeout(()=>void resolve(attempt+1),500*2**attempt);else setError("Wallet connection failed. Try again.");}}
  };
  void resolve(0);
  return()=>{cancelled=true;if(timer!==undefined)clearTimeout(timer);};
 },[selectedKey,walletsReady]);
 const ready=privyReady&&walletsReady;
 const actions=useRef({ready,wallets,connectWallet,isModalOpen});actions.current={ready,wallets,connectWallet,isModalOpen};
 const connect=useCallback(()=>{const current=actions.current;if(current.isModalOpen)return;if(!current.ready){setError("Wallet service is loading. Please try again.");setOpen(true);return;}if(current.wallets.length)setOpen(true);else current.connectWallet({walletChainType:"ethereum-only",description:tx("Select a wallet to continue")});},[]);
 const provider=resolved&&resolved.key===selectedKey?resolved.provider:undefined;
 useEffect(()=>{onConnection({provider,address:selected?.address as Address|undefined,ready:ready&&!!provider,connect});},[onConnection,provider,selected?.address,ready,connect]);
 useEffect(()=>{if(walletsReady&&wallets.length>0)onSession(true);},[walletsReady,wallets.length,onSession]);
 const opened=useRef(0);
 useEffect(()=>{if(ready&&openRequest>opened.current){opened.current=openRequest;connect();}},[ready,openRequest,connect]);
 const add=()=>{if(!ready){setError("Wallet service is loading. Please try again.");return;}if(isModalOpen)return;setOpen(false);connectWallet({walletChainType:"ethereum-only",description:tx("Select a wallet to continue")});};
 const disconnect=async()=>{if(!selected)return;try{await Promise.resolve(selected.disconnect());setResolved(undefined);setChosen("");setOpen(false);try{localStorage.removeItem(selectionKey);}catch{/* SDK remains authoritative. */}if(wallets.length<=1)onSession(false);}catch{setError("Unable to disconnect. Try again.");}};
 return <Manager open={open} onClose={()=>setOpen(false)} wallets={wallets} selected={selected} onSelect={wallet=>{choose(wallet);setOpen(false);}} onAdd={add} onDisconnect={disconnect} error={error}/>;
}
export default function PrivyWalletBridge(props:BridgeProps){
 const language=useLanguage();
 const config=useMemo<PrivyClientConfig>(()=>({loginMethods:["wallet"],supportedChains:[chain],defaultChain:chain,appearance:{theme:"#0c0e17",accentColor:"#ffd400",logo:<svg width="200" height="40" viewBox="0 0 200 40" aria-label="TickerDrop"><path d="M4 9h25v7H20v19h-7V16H4Z" fill="#ffd400"/><text x="40" y="27" fontFamily="monospace" fontWeight="bold" fontSize="19" fill="#e8e9f0">TICKERDROP</text></svg>,landingHeader:tx("Connect a wallet"),walletChainType:"ethereum-only",walletList:walletOptions},externalWallets:{coinbaseWallet:{config:{preference:{options:"eoaOnly"}}}},embeddedWallets:{ethereum:{createOnLogin:"off"}},intl:{defaultCountry:"US",textLocalization:localization()}}),[language]);
 return <PrivyProvider appId={PRIVY_APP_ID} config={config}><Adapter {...props}/></PrivyProvider>;
}
