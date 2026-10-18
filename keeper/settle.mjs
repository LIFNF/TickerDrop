// Runs at the New York open. Settles every recorded session the chain hasn't settled yet,
// oldest first, using the final close captured by snapshot.mjs.
//
//   REPORTER_KEY  private key of the reporter set on GainPool
//   RPC_URL       optional, defaults to the public Robinhood Chain endpoint
//   DRY=1         print the rounds without sending

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildRound } from "./round.mjs";
import { chain, dateOf, dayOf, deployed, isLive, isoOf, log, nasdaq, nyNow, poolAbi, pub, sessionsDir, sleep, tickers } from "./lib.mjs";

async function main() {
  if (!isLive()) return log("not deployed yet");

  const now = nyNow();
  const info = await nasdaq("market-info");
  if (!info.isBusinessDay || info.openRaw?.slice(0, 10) !== now.date) return log(`market closed on ${now.date}`);
  if (now.minutes < 9 * 60 + 30) return log(`${now.date} not open yet`);

  const prev = isoOf(info.previousTradeDate);
  const lastDay = Number(await pub.readContract({ address: deployed.pool, abi: poolAbi, functionName: "lastDay" }));

  const pending = (existsSync(sessionsDir) ? readdirSync(sessionsDir) : [])
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => dayOf(d) > lastDay && d <= prev)
    .sort();

  if (pending.length === 0) {
    if (dayOf(prev) > lastDay) throw new Error(`no recorded close for ${prev}`);
    return log(`nothing to settle (last ${dateOf(lastDay)})`);
  }

  const key = process.env.REPORTER_KEY;
  const dry = process.env.DRY === "1";
  if (!key && !dry) throw new Error("REPORTER_KEY missing");
  const account = key ? privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`) : undefined;
  const wallet = account && createWalletClient({ account, chain, transport: http() });

  for (const date of pending) {
    const day = dayOf(date);
    const at = Number(await pub.readContract({ address: deployed.pool, abi: poolAbi, functionName: "settleableAt", args: [day] }));
    if (at === 0) {
      log(`${date} predates launch, skipped`);
      continue;
    }
    const wait = at * 1000 - Date.now() + 5000;
    if (wait > 10 * 60_000) return log(`${date} opens for settlement at ${new Date(at * 1000).toISOString()}`);
    if (wait > 0) await sleep(wait);

    const { gains } = JSON.parse(readFileSync(new URL(`${date}.json`, sessionsDir)));
    const { picked, positive, weight } = buildRound(gains, tickers);
    log(`${date} day=${day} green=${positive} paying=${picked.length} weight=${(weight / 1e4).toFixed(4)}%`);
    for (const p of picked) log(`  #${p.id} ${p.s.padEnd(5)} +${(p.g / 1e4).toFixed(4)}%`);
    if (dry) continue;

    const args = [day, picked.map((p) => p.id), picked.map((p) => p.g)];
    const { request } = await pub.simulateContract({ account, address: deployed.pool, abi: poolAbi, functionName: "settle", args });
    const hash = await wallet.writeContract(request);
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`${date}: settle reverted (${hash})`);
    log(`${date} settled ${hash}, gas ${rc.gasUsed}`);
  }

  if (dayOf(prev) > lastDay && !pending.includes(prev)) throw new Error(`no recorded close for ${prev}`);
}

main().catch((e) => {
  console.error('Settlement failed. Inspect protected operator diagnostics; raw provider errors are suppressed.');
  process.exit(1);
});
