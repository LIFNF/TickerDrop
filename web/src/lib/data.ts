import { useEffect, useState } from "react";
import type { Address } from "viem";
import { addr, dropAbi, live, poolAbi, tickrAbi } from "../chain/config";
import { pub, useWallet } from "./wallet";

export type Ticker = { id: number; s: string; n: string; cap: number };

let tickerCache: Promise<Ticker[]> | undefined;

export function useTickers() {
  const [list, setList] = useState<Ticker[]>([]);
  useEffect(() => {
    tickerCache ??= fetch(`${import.meta.env.BASE_URL}tickers.json`)
      .then((r) => r.json())
      .then((rows: [string, string, number][]) => rows.map(([s, n, cap], i) => ({ id: i + 1, s, n, cap })));
    tickerCache.then(setList);
  }, []);
  return list;
}

export type Round = { day: number; gainers: number; paid: number; weight: number; blockNo: bigint; eth: bigint; tkn: bigint };
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
  free: boolean;
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
  free: false,
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
  const d = { address: addr.drop, abi: dropAbi } as const;
  const p = { address: addr.pool, abi: poolAbi } as const;
  const t = { address: addr.tickr, abi: tickrAbi } as const;

  const [phase, minted, bits, pot, count, book, liveAt] = await Promise.all([
    pub.readContract({ ...d, functionName: "phase" }),
    pub.readContract({ ...d, functionName: "minted" }),
    pub.readContract({ ...d, functionName: "mintedBits" }),
    pub.readContract({ ...p, functionName: "pot" }),
    pub.readContract({ ...p, functionName: "roundCount" }),
    pub.readContract({ ...d, functionName: "book" }),
    pub.readContract({ ...t, functionName: "liveAt" }),
  ]);

  const n = Number(count);
  const idx = Array.from({ length: Math.min(n, 10) }, (_, i) => BigInt(n - 1 - i));
  const rounds = await Promise.all(
    idx.map((i) =>
      pub.readContract({ ...p, functionName: "rounds", args: [i] }).then(([day, gainers, paid, weight, blockNo, eth, tkn]) => ({
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
  let free = false;
  if (account) {
    const r = await Promise.all([
      pub.readContract({ ...d, functionName: "tokensOf", args: [account] }),
      pub.readContract({ ...p, functionName: "credit", args: [account] }),
      pub.readContract({ ...t, functionName: "balanceOf", args: [account] }),
      pub.readContract({ ...d, functionName: "freeMint", args: [account] }),
    ]);
    mine = r[0].map(Number);
    [, credit, tickr, free] = r;
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
    free,
  };
}

export function useChainState() {
  const { account, tick } = useWallet();
  const [state, setState] = useState<State>(empty);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const load = () =>
      readAll(account)
        .then((s) => !stop && setState(s))
        .catch(() => {});
    load();
    const t = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [account, tick]);

  return state;
}

export async function winners(r: Round) {
  const logs = await pub.getContractEvents({
    address: addr.pool,
    abi: poolAbi,
    eventName: "Paid",
    args: { day: r.day },
    fromBlock: r.blockNo,
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
