import { formatEther } from "viem";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function eth(v: bigint, dp = 4) {
  const n = Number(formatEther(v));
  if (n === 0) return "0";
  if (n < 10 ** -dp) return `<${10 ** -dp}`;
  return n.toLocaleString("en-US", { maximumFractionDigits: dp });
}

export function compact(n: number) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export const tkn = (v: bigint) => compact(Number(v / 10n ** 18n));

export const pct = (units: number, dp = 2) => (units / 1e4).toFixed(dp) + "%";

// day number (days since epoch, New York date) -> 2026-10-14
export const dayStr = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
