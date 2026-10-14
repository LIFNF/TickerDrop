import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type Hash,
  type WalletClient,
} from "viem";
import { chain } from "../chain/config";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const pub = createPublicClient({ chain, transport: http(undefined, { batch: true }) });

export type Toast = { id: number; kind: "wait" | "ok" | "err"; text: string; hash?: Hash };

type Ctx = {
  account?: Address;
  wrongChain: boolean;
  connect(): Promise<void>;
  send(label: string, fn: (w: WalletClient, a: Address) => Promise<Hash>): Promise<boolean>;
  toasts: Toast[];
  tick: number;
};

const WalletCtx = createContext<Ctx>(null!);
export const useWallet = () => useContext(WalletCtx);

let seq = 0;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);

  const eth = typeof window !== "undefined" ? window.ethereum : undefined;

  useEffect(() => {
    if (!eth) return;
    const onAcc = (a: string[]) => setAccount(a[0] as Address | undefined);
    const onChain = (c: string) => setChainId(parseInt(c, 16));
    eth.request({ method: "eth_accounts" }).then(onAcc).catch(() => {});
    eth.request({ method: "eth_chainId" }).then(onChain).catch(() => {});
    eth.on("accountsChanged", onAcc);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener("accountsChanged", onAcc);
      eth.removeListener("chainChanged", onChain);
    };
  }, [eth]);

  const toast = useCallback((t: Omit<Toast, "id">, id = ++seq) => {
    setToasts((all) => [...all.filter((x) => x.id !== id), { ...t, id }]);
    if (t.kind !== "wait") setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 7000);
    return id;
  }, []);

  const connect = useCallback(async () => {
    if (!eth) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    const a = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
    setAccount(a[0]);
  }, [eth]);

  const ensureChain = useCallback(async () => {
    if (!eth) throw new Error("no wallet");
    const hex = numberToHex(chain.id);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e: any) {
      if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
          },
        ],
      });
    }
  }, [eth]);

  const send = useCallback<Ctx["send"]>(
    async (label, fn) => {
      const id = toast({ kind: "wait", text: label });
      try {
        let a = account;
        if (!a) {
          const got = (await eth!.request({ method: "eth_requestAccounts" })) as Address[];
          a = got[0];
          setAccount(a);
        }
        await ensureChain();
        const w = createWalletClient({ account: a, chain, transport: custom(eth!) });
        const hash = await fn(w, a);
        toast({ kind: "wait", text: label, hash }, id);
        const rc = await pub.waitForTransactionReceipt({ hash });
        if (rc.status !== "success") throw new Error("reverted");
        toast({ kind: "ok", text: label, hash }, id);
        setTick((t) => t + 1);
        return true;
      } catch (e: any) {
        const msg = e?.shortMessage || e?.details || e?.message || "failed";
        toast({ kind: "err", text: `${label} · ${String(msg).split("\n")[0].slice(0, 120)}` }, id);
        return false;
      }
    },
    [account, eth, ensureChain, toast],
  );

  const value = useMemo<Ctx>(
    () => ({ account, wrongChain: !!account && chainId !== undefined && chainId !== chain.id, connect, send, toasts, tick }),
    [account, chainId, connect, send, toasts, tick],
  );

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
