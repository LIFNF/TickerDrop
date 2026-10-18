import { formatEther } from "viem";
import {numberLocale} from "./locale";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const compactFormats=new Map<string,Intl.NumberFormat>();

export function eth(v: bigint, dp = 4) {
  const n = Number(formatEther(v));
  if (n === 0) return "0";
  if (n < 10 ** -dp) return `<${10 ** -dp}`;
  return n.toLocaleString(numberLocale(), { maximumFractionDigits: dp });
}

export function compact(n: number) {
  const locale=numberLocale();
  if(!compactFormats.has(locale))compactFormats.set(locale,new Intl.NumberFormat(locale,{notation:"compact",maximumFractionDigits:2}));
  return compactFormats.get(locale)!.format(n);
}

export const tkn = (v: bigint) => compact(Number(v / 10n ** 18n));

export const pct = (units: number, dp = 2) => (units / 1e4).toLocaleString(numberLocale(),{maximumFractionDigits:dp}) + "%";

// day number (days since epoch, New York date) -> 2026-10-14
export const dayStr = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
