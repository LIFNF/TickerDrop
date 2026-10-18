import {Component,Suspense,lazy,useCallback,useState,type ReactNode} from "react";
import {WalletProvider,type WalletConnection as Connection} from "../lib/wallet";
import {tx} from "../lib/copy";
const PrivyWalletBridge=lazy(()=>import("./PrivyWalletBridge"));
const restoreKey="tickerdrop:privy-session:v1";
function shouldRestore(){try{return localStorage.getItem(restoreKey)==="1"||!!localStorage.getItem("tickerdrop:active-wallet:v1");}catch{return false;}}
class WalletBoundary extends Component<{children:ReactNode;onError():void;onRetry():void},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){this.props.onError();if(import.meta.env.DEV)console.error(error);}
 render(){return this.state.failed?<div className="wallet-service-message" role="alert"><span>{tx("Wallet service unavailable. Please try again.")}</span><button className="btn sm" onClick={this.props.onRetry}>{tx("Try again")}</button></div>:this.props.children;}
}
export function WalletConnection({children}:{children:ReactNode}){
 const [enabled,setEnabled]=useState(shouldRestore),[request,setRequest]=useState(0),[connection,setConnection]=useState<Connection>();
 const start=useCallback(()=>{setEnabled(true);setRequest(value=>value+1);},[]);
 const session=useCallback((active:boolean)=>{try{if(active)localStorage.setItem(restoreKey,"1");else localStorage.removeItem(restoreKey);}catch{/* The SDK controls the actual wallet session. */}},[]);
 const failed=useCallback(()=>{setConnection(undefined);},[]);
 const restart=useCallback(()=>{window.location.reload();},[]);
 return <WalletProvider connection={connection||{ready:false,connect:start}}>{children}
  {enabled&&<WalletBoundary onError={failed} onRetry={restart}><Suspense fallback={<div className="wallet-service-message" role="status">{tx("Loading wallet service…")}</div>}><PrivyWalletBridge onConnection={setConnection} onSession={session} openRequest={request}/></Suspense></WalletBoundary>}
 </WalletProvider>;
}
