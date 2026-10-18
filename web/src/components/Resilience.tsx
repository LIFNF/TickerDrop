import {Component,type ReactNode,useEffect,useState} from "react";
import {dataStatus} from "../lib/reliable";
import {tx} from "../lib/copy";
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="safe-error" role="alert"><h1>{tx("Page failed to load")}</h1><p>{tx("Refresh to try again.")}</p><button onClick={()=>window.location.reload()}>{tx("Reload")}</button></main>:this.props.children;}
}
export function DataHealth(){
  const [states,setStates]=useState(dataStatus);
  useEffect(()=>{const update=()=>setStates(dataStatus());window.addEventListener("tickerdrop:data",update);update();return()=>window.removeEventListener("tickerdrop:data",update);},[]);
  const failed=states.some(([,s])=>s==="error");
  if(!failed)return null;
  return <div className="data-health" role="status">{tx("Connection unavailable. Retrying…")}</div>;
}
