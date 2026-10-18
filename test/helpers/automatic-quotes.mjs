// TEST ONLY: synthetic providers and clock. Explicitly preloaded only by the local-chain integration test.
if(!process.env.TICKERDROP_TEST_ROOT||!process.env.RPC_URL?.startsWith('http://127.0.0.1:'))throw Error('Quote fixtures require an isolated local test chain');
const ActualDate=Date,instant=Number(process.env.FIXTURE_NOW);
globalThis.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
const actualFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url??String(input));
 if(url.hostname==='scanner.tradingview.com')return Response.json({totalCount:2,data:[
  {s:'NASDAQ:AAA',d:['AAA','NASDAQ',10,120,5.45,'delayed_streaming_900','stock','USD']},
  {s:'NASDAQ:BBB',d:['BBB','NASDAQ',20,0,0,'delayed_streaming_900','stock','USD']}
 ]});
 if(url.hostname==='api.nasdaq.com'){
  if(url.pathname.endsWith('market-info')){
   const nextDay=process.env.FIXTURE_STAGE==='open';
   return Response.json({data:{isBusinessDay:true,openRaw:`2026-10-${nextDay?'20':'19'}T09:30:00`,closeRaw:`2026-10-${nextDay?'20':'19'}T16:00:00`,previousTradeDate:nextDay?'Oct 19, 2026':'Oct 16, 2026',nextTradeDate:nextDay?'Oct 21, 2026':'Oct 20, 2026'}});
  }
  if(url.pathname.includes('/screener/'))return Response.json({data:{rows:[{symbol:'AAA',pctchange:'120%'},{symbol:'BBB',pctchange:'0%'}]}});
  const symbol=url.pathname.split('/')[3];
  return Response.json({data:{symbol,exchange:'NASDAQ-CM',isNasdaqListed:true,primaryData:{lastTradeTimestamp:'Oct 19, 2026',lastSalePrice:'$10',percentageChange:'120%'}}});
 }
 return actualFetch(input,options);
};
