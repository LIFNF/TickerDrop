// Packs the most recent recorded closes for the site: web/public/sessions.json
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../data/sessions/", import.meta.url);
const KEEP = 10;

const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-KEEP) : [];
const sessions = files.reverse().map((f) => {
  const s = JSON.parse(readFileSync(new URL(f, dir)));
  return { date: s.date, gains: s.gains };
});

writeFileSync(new URL("../web/public/sessions.json", import.meta.url), JSON.stringify(sessions));
console.log(`sessions.json: ${sessions.map((s) => s.date).join(", ") || "empty"}`);
