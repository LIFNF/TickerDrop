export function parseTradingView(raw,tickers){
 if(!Array.isArray(raw?.data))throw Error('Invalid TradingView quote response');
 const ids=new Map(tickers.map(t=>[t.s,t.id])),seen=new Set(),out=[];
 for(const row of raw.data){
  if(!Array.isArray(row?.d))continue;
  const [symbol,exchange,price,change,,mode,type,currency]=row.d;
  const id=ids.get(symbol);
  if(!id||row.s!=='NASDAQ:'+symbol||exchange!=='NASDAQ'||!['stock','dr'].includes(type)||currency!=='USD')continue;
  if(seen.has(id))throw Error('Duplicate TradingView quote');seen.add(id);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(change)||change < -100||typeof mode!=='string')continue;
  out.push({id,s:symbol,price,change,mode});
 }
 return out.sort((a,b)=>a.id-b.id);
}
export function rankProgress(rows,exhausted){
 const positive=rows.map(q=>({id:q.id,g:Math.round(q.change*10000)})).filter(q=>q.g>0).sort((a,b)=>b.g-a.g||a.id-b.id);
 const ranked=[];let weight=0;
 for(const q of positive){if(weight>=1000000)break;if(!Number.isSafeInteger(q.g)||q.g>0xffffffff)throw Error('Unsafe gain units');ranked.push(q);weight+=Math.min(q.g,1000000-weight);}
 const last=rows.at(-1),lastUnits=last?Math.round(last.change*10000):0;
 const rankingExhausted=exhausted||lastUnits<=0;
 // Read through a boundary tie so NFT-ID tie-breaking cannot omit an earlier ID.
 const needsMore=!rankingExhausted&&(weight<1000000||lastUnits>=ranked.at(-1).g);
 return {ranked,weight,rankingExhausted,needsMore};
}
