export type DataState = "loading" | "ok" | "backup" | "error";
const health = new Map<string, DataState>();
export function dataStatus() { return [...health.entries()]; }
export function markData(name: string, state: DataState) {
  health.set(name,state);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tickerdrop:data"));
}
export async function limitedText(response:Response,limit=4_000_000):Promise<string>{
 const declared=response.headers?.get("content-length");
 if(declared&&/^\d+$/.test(declared)&&Number(declared)>limit){void response.body?.cancel().catch(()=>{});throw Error("Unexpected data size");}
 if(!response.body){const text=await response.text();if(text.length>limit)throw Error("Unexpected data size");return text;}
 const reader=response.body.getReader(),decoder=new TextDecoder("utf-8",{fatal:true}),parts:string[]=[];
 let bytes=0;
 try{
  while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;
   if(bytes>limit){void reader.cancel().catch(()=>{});throw Error("Unexpected data size");}
   parts.push(decoder.decode(next.value,{stream:true}));
  }
  parts.push(decoder.decode());return parts.join("");
 }finally{reader.releaseLock();}
}
export function jsonResource<T>(name: string, urls: string[], validate: (raw: unknown) => T, ttl = 60_000) {
  let value: T | undefined, updated = 0, pending: Promise<T> | undefined;
  return async (): Promise<T> => {
    if (value !== undefined && Date.now()-updated < ttl) return value;
    if (pending) return pending;
    markData(name,"loading");
    pending = (async()=>{
      for (let index=0; index<urls.length; index++) {
        for (let attempt=0; attempt<2; attempt++) {
          const controller=new AbortController();
          const timeout=setTimeout(()=>controller.abort(),6000);
          try {
            const response=await fetch(urls[index],{signal:controller.signal,credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",cache:"no-cache"});
            if (!response.ok) { if(response.status===404) break; throw new Error("Data unavailable"); }
            const text=await limitedText(response);
            value=validate(JSON.parse(text)); updated=Date.now();
            markData(name,index===0?"ok":"backup"); return value;
          } catch { /* Retry a bounded number of times, then try the independent copy. */ }
          finally { clearTimeout(timeout); }
        }
      }
      markData(name,"error");
      throw new Error("Data could not be validated or loaded");
    })().finally(()=>{pending=undefined;});
    return pending;
  };
}
export function tickerRows(raw: unknown) {
  if (!Array.isArray(raw) || raw.length!==3172) throw new Error("Invalid listing count");
  const seen=new Set<string>();
  return Array.from(raw,(row,i)=>{
    if (!Array.isArray(row) || row.length!==3) throw new Error("Invalid listing");
    const [s,n,cap]=row;
    if(typeof s!=="string" || !/^[A-Z0-9.-]{1,5}$/.test(s) || seen.has(s)
      || typeof n!=="string" || n.length<1 || n.length>180 || typeof cap!=="number" || !Number.isFinite(cap) || cap<0) throw new Error("Invalid listing");
    seen.add(s); return {id:i+1,s,n,cap};
  });
}
export function sessionRows(raw: unknown): {date:string;gains:(number|null)[];allocationOnly?:boolean}[] {
  if(!Array.isArray(raw)||raw.length>20) throw new Error("Invalid sessions");
  const dates=new Set<string>();
  const result=Array.from(raw,row=>{
    if(!row || typeof row!=="object") throw new Error("Invalid session");
    const {date,gains}=row as {date:unknown;gains:unknown};
    if(typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
      || new Date(date).toISOString().slice(0,10)!==date || dates.has(date) || !Array.isArray(gains) || gains.length!==3172
      || Array.from(gains).some(g=>g!==null && (!Number.isSafeInteger(g)||g < -1_000_000 || g>0xffffffff))) throw new Error("Invalid session");
    dates.add(date); return {date,gains:gains as (number|null)[],...((row as {allocationOnly?:unknown}).allocationOnly===true?{allocationOnly:true}:{})};
  });
  return result.sort((a,b)=>b.date.localeCompare(a.date));
}
