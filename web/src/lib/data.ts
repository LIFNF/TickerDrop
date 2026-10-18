import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { addr, dropAbi, live, liquidityVaultAbi, poolAbi, tickrAbi } from "../chain/config";
import { pub, useWallet } from "./wallet";
import { jsonResource, tickerRows, markData } from "./reliable";

export type Ticker = { id: number; s: string; n: string; cap: number };

const loadTickers=jsonResource("listings",[`${import.meta.env.BASE_URL}tickers.json`,`${import.meta.env.BASE_URL}backup/tickers.json`],tickerRows,300_000);
export function useTickers() {
  const [list,setList]=useState<Ticker[]>([]);
  useEffect(()=>{
    let stopped=false;
    const load=()=>loadTickers().then(v=>{if(!stopped)setList(v);}).catch(()=>{});
    void load(); const timer=setInterval(load,30_000);
    return ()=>{stopped=true;clearInterval(timer);};
  },[]);
  return list;
}
export type Round = { index: bigint; day: number; gainers: number; paid: number; weight: number; blockNo: bigint; eth: bigint; tkn: bigint };
export type Ask = { id: number; seller: Address; price: bigint };

export type State = {
  ready: boolean;
  phase: number;
  minted: number;
  taken: Set<number>;
  pot: { eth: bigint; tkn: bigint };
  rounds: Round[];
  roundCount: number;
  book: Ask[];
  liveAt: number;
  mine: number[];
  credit: bigint;
  tickr: bigint;
  liquidity: {ready:boolean;addedETH:bigint;pendingETH:bigint;heldTICKR:bigint;pendingTICKR:bigint};
};

const empty: State = {
  ready: false,
  phase: 0,
  minted: 0,
  taken: new Set(),
  pot: { eth: 0n, tkn: 0n },
  rounds: [],
  roundCount: 0,
  book: [],
  liveAt: 0,
  mine: [],
  credit: 0n,
  tickr: 0n,
  liquidity: {ready:false,addedETH:0n,pendingETH:0n,heldTICKR:0n,pendingTICKR:0n},
};

const bitsToSet = (bits: readonly bigint[]) => {
  const s = new Set<number>();
  bits.forEach((w, i) => {
    let x = w;
    for (let b = 0; x; b++, x >>= 1n) if (x & 1n) s.add(i * 256 + b);
  });
  return s;
};

async function readAll(account?: Address): Promise<State> {
  const blockNumber = await pub.getBlockNumber();
  const d = { address: addr.drop, abi: dropAbi } as const;
  const p = { address: addr.pool, abi: poolAbi } as const;
  const t = { address: addr.tickr, abi: tickrAbi } as const;

  const [phase, minted, bits, pot, count, book, liveAt] = await Promise.all([
    pub.readContract({ ...d, functionName: "phase", blockNumber }),
    pub.readContract({ ...d, functionName: "minted", blockNumber }),
    pub.readContract({ ...d, functionName: "mintedBits", blockNumber }),
    pub.readContract({ ...p, functionName: "pot", blockNumber }),
    pub.readContract({ ...p, functionName: "roundCount", blockNumber }),
    pub.readContract({ ...d, functionName: "book", blockNumber }),
    pub.readContract({ ...t, functionName: "liveAt", blockNumber }),
  ]);
  const liquidity=await (async()=>{
    try {
      const vault=await pub.readContract({...t,functionName:"liquidityVault",blockNumber});
      const [addedETH,pendingETH,pendingTICKR,heldTICKR]=await Promise.all([
        pub.readContract({address:vault,abi:liquidityVaultAbi,functionName:"addedETH",blockNumber}),
        pub.readContract({address:vault,abi:liquidityVaultAbi,functionName:"pendingETH",blockNumber}),
        pub.readContract({address:vault,abi:liquidityVaultAbi,functionName:"pendingTokens",blockNumber}),
        pub.readContract({address:addr.tickr,abi:tickrAbi,functionName:"balanceOf",args:[vault],blockNumber}),
      ]);
      return {ready:true,addedETH,pendingETH,heldTICKR,pendingTICKR};
    } catch { return empty.liquidity; }
  })();

  const n = Number(count);
  const idx = Array.from({ length: Math.min(n, 10) }, (_, i) => BigInt(n - 1 - i));
  const rounds = await Promise.all(
    idx.map((i) =>
      pub.readContract({ ...p, functionName: "rounds", args: [i], blockNumber }).then(([day, gainers, paid, weight, blockNo, eth, tkn]) => ({
        index: i,
        day,
        gainers,
        paid,
        weight,
        blockNo,
        eth,
        tkn,
      })),
    ),
  );

  let mine: number[] = [];
  let credit = 0n;
  let tickr = 0n;
  if (account) {
    const r = await Promise.all([
      pub.readContract({ ...d, functionName: "tokensOf", args: [account], blockNumber }),
      pub.readContract({ ...p, functionName: "credit", args: [account], blockNumber }),
      pub.readContract({ ...t, functionName: "balanceOf", args: [account], blockNumber }),
    ]);
    mine = r[0].map(Number);
    [, credit, tickr] = r;
  }

  return {
    ready: true,
    phase,
    minted: Number(minted),
    taken: bitsToSet(bits),
    pot: { eth: pot[0], tkn: pot[1] },
    rounds,
    roundCount: n,
    book: book[0].map((id, i) => ({ id: Number(id), seller: book[1][i], price: book[2][i] })),
    liveAt: Number(liveAt),
    mine,
    credit,
    tickr,
    liquidity,
  };
}

export function useChainState() {
  const { account, tick } = useWallet();
  const [state, setState] = useState<State>(empty);
  const owner=useRef(account);

  useEffect(() => {
    owner.current=account;
    setState(empty); // Clear the prior wallet immediately on disconnect/account changes.
    if (!live) return;
    let stop=false, busy=false;
    const load=async()=>{
      if(busy||stop)return; busy=true;
      try { const next=await readAll(account); if(!stop){setState(next);markData("chain","ok");} }
      catch {if(!stop){setState(s=>({...s,ready:false}));markData("chain","error");}}
      finally {busy=false;}
    };
    markData("chain","loading"); void load();
    const timer=setInterval(load,20_000);
    return ()=>{stop=true;clearInterval(timer);};
  },[account,tick]);
  return owner.current===account?state:empty;
}

export async function winners(r: Round) {
  const start = await pub.readContract({address:addr.pool,abi:poolAbi,functionName:"roundStartBlock",args:[r.index]});
  const logs = await pub.getContractEvents({
    address: addr.pool,
    abi: poolAbi,
    eventName: "Paid",
    args: { day: r.day },
    fromBlock: start || r.blockNo,
    toBlock: r.blockNo,
  });
  return logs.map((l) => ({
    id: Number(l.args.id),
    holder: l.args.holder as Address,
    gain: Number(l.args.gain),
    eth: l.args.eth as bigint,
    tkn: l.args.tkn as bigint,
  }));
}
