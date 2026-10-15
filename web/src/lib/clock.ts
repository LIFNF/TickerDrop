const ny = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function parts(ms: number) {
  const o: Record<string, number> = {};
  for (const p of ny.formatToParts(ms)) if (p.type !== "literal") o[p.type] = +p.value;
  return o;
}

// New York wall clock -> epoch ms
function wall(y: number, m: number, d: number, h: number, mi: number) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = parts(guess);
  return guess + (guess - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
}

// next 09:30 New York on a weekday; holidays aren't known here
export function nextOpen(now = Date.now()) {
  const p = parts(now);
  for (let i = 0; i < 8; i++) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const at = wall(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 9, 30);
    if (at > now) return at;
  }
  return now;
}

export function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h >= 24 ? `${Math.floor(h / 24)}d ` : ""}${pad(h % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
