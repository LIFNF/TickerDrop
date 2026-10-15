import { useEffect, useState } from "react";

// gains are in contract units: 1e6 = 100%, null = no print that day
export type Session = { date: string; gains: (number | null)[] };

export type Pick = { id: number; gain: number; weight: number; share: number };

export type Board = {
  date: string;
  picks: Pick[];
  green: number;
  red: number;
  sum: number; // Σ weight, 1e6 = 100%
};

export const FULL = 1_000_000;

let feed: Promise<Session[]> | undefined;

export function useSessions() {
  const [list, setList] = useState<Session[]>([]);
  useEffect(() => {
    feed ??= fetch(`${import.meta.env.BASE_URL}sessions.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    feed.then(setList);
  }, []);
  return list;
}

// same walk as GainPool.settle: gain desc, id asc, stop at 100%
export function boardOf(s: Session): Board {
  const order: number[] = [];
  let red = 0;
  s.gains.forEach((g, i) => {
    if (g === null) return;
    if (g > 0) order.push(i);
    else red++;
  });
  order.sort((a, b) => s.gains[b]! - s.gains[a]! || a - b);

  const picks: Pick[] = [];
  let sum = 0;
  for (const i of order) {
    if (sum >= FULL) break;
    const g = s.gains[i]!;
    const w = Math.min(g, FULL - sum);
    sum += w;
    picks.push({ id: i + 1, gain: g, weight: w, share: 0 });
  }
  picks.forEach((p) => (p.share = p.weight / sum));
  return { date: s.date, picks, green: order.length, red, sum };
}

export const gainPct = (units: number, dp = 2) => `${units > 0 ? "+" : ""}${(units / 1e4).toFixed(dp)}%`;
