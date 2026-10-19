// Runs at the New York open. Settles every recorded session the chain hasn't settled yet,
// oldest first, using the final close captured by snapshot.mjs.
//
//   RELAYER_KEY   gas-paying transaction sender; cannot choose results alone
//   data/attestations/YYYY-MM-DD.json must contain independent quorum signatures
//   RPC_URL       optional, defaults to the public Robinhood Chain endpoint
//   DRY=1         print the rounds without sending

import { existsSync, readdirSync, readFileSync } from "node:fs";
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import { createWalletClient, http, encodeAbiParameters, keccak256, stringToHex, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildRound } from "./round.mjs";
import {marketRound} from './allocation.mjs';
import {safeError} from "./safe-error.mjs";
import { nyTimestamp, sessionSchedule, validateQuoteSession } from "./calendar.mjs";
import { marketOracleAbi, chain, dateOf, dayOf, deployed, isLive, isoOf, log, nasdaq, nyNow, poolAbi, pub, sessionsDir, sleep, tickers, root } from "./lib.mjs";

async function main() {
  if (!isLive()) throw new Error("Deployment configuration is missing; settlement is not operational");
  if(await pub.getChainId()!==chain.id)throw new Error("RPC network does not match deployment; refusing settlement");

  const now = nyNow();
  const info = await nasdaq("market-info");
  if (!info.isBusinessDay || info.openRaw?.slice(0, 10) !== now.date) return log(`market closed on ${now.date}`);
  if (now.minutes < 9 * 60 + 30) return log(`${now.date} not open yet`);

  const prev = isoOf(info.previousTradeDate);
  const launchAt = Number(await pub.readContract({address:deployed.tickr,abi:[{type:"function",name:"liveAt",stateMutability:"view",inputs:[],outputs:[{type:"uint64"}]}],functionName:"liveAt"}));
  if (!launchAt) return log("trading has not launched");
  let lastDay = Number(await pub.readContract({ address: deployed.pool, abi: poolAbi, functionName: "lastDay" }));
  if(deployed.version>=3&&process.env.DRY!=='1'){
    for(let rounds=0;rounds<32;rounds++){
      const next=await pub.readContract({address:deployed.marketOracle,abi:marketOracleAbi,functionName:'nextSession',args:[lastDay]});
      if(!next||next>dayOf(prev)||existsSync(new URL(dateOf(next)+'.json',sessionsDir)))break;
      execFileSync(process.execPath,[fileURLToPath(new URL('recover-published.mjs',import.meta.url)),String(next),'--resume'],{stdio:'inherit',timeout:10*60000});
      lastDay=Number(await pub.readContract({address:deployed.pool,abi:poolAbi,functionName:'lastDay'}));
    }
  }

  const pending = (existsSync(sessionsDir) ? readdirSync(sessionsDir) : [])
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => dayOf(d) > lastDay && d <= prev && nyTimestamp(d,570) >= launchAt)
    .sort();

  if (pending.length === 0) {
    if (dayOf(prev) > lastDay && nyTimestamp(prev,570) >= launchAt) throw new Error(`no recorded close for ${prev}`);
    return log(`nothing to settle (last ${dateOf(lastDay)})`);
  }

  const oracle = await pub.readContract({address:deployed.pool, abi:poolAbi, functionName:"marketOracle"});
  if (/^0x0+$/.test(oracle)) throw new Error("Quote quorum is not configured; settlement blocked");
  const key = process.env.RELAYER_KEY;
  const dry = process.env.DRY === "1";
  if (!key && !dry) throw new Error("RELAYER_KEY missing");
  const account = key ? privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`) : undefined;
  const wallet = account && createWalletClient({ account, chain, transport: http() });

  for (const date of pending) {
    const day = dayOf(date);
    let at = Number(await pub.readContract({ address: deployed.pool, abi: poolAbi, functionName: "settleableAt", args: [day] }));
    const wait = at * 1000 - Date.now() + 5000;
    if (wait > 10 * 60_000) return log(`${date} opens for settlement at ${new Date(at * 1000).toISOString()}`);
    if (wait > 0) await sleep(wait);

    const sessionText = readFileSync(new URL(`${date}.json`, sessionsDir), "utf8");
    const record = JSON.parse(sessionText);
    const { picked, positive, weight } = marketRound(record,tickers);
    log(`${date} day=${day} green=${positive} paying=${picked.length} weight=${(weight / 1e4).toFixed(4)}%`);
    for (const p of picked) log(`  #${p.id} ${p.s.padEnd(5)} +${(p.g / 1e4).toFixed(4)}%`);
    let [expected] = await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:"session",args:[day]});
    const digest = keccak256(encodeAbiParameters(
      [{type:"uint256"},{type:"address"},{type:"uint32"},{type:"uint16[]"},{type:"uint32[]"}],
      [BigInt(chain.id),deployed.pool,day,picked.map(p=>p.id),picked.map(p=>p.g)]
    ));
    if (/^0x0+$/.test(expected)) {
      const {openedAt,closedAt,nextOpen} = sessionSchedule(record,info,now.date);
      const attestationFile = new URL(`data/attestations/${date}.json`, root);
      if (!existsSync(attestationFile)) throw new Error(`${date}: independent quote attestations missing`);
      const attestations = JSON.parse(readFileSync(attestationFile,"utf8"));
      const quotesHash = keccak256(stringToHex(sessionText));
      if (attestations.day !== day || attestations.quotesHash !== quotesHash || !Array.isArray(attestations.signatures))
        throw new Error(`${date}: attestations do not match the recorded quotes`);
      if(deployed.version>=3&&attestations.signerEpoch!==Number(await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:'signerEpoch'})))
        throw new Error(`${date}: signature epoch is no longer authorized`);
      const signatures = attestations.signatures
        .filter(x=>typeof x.signer==="string" && isHex(x.signature) && x.signature.length===132)
        .sort((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
      const threshold = Number(await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:"threshold"}));
      if (signatures.length < threshold || new Set(signatures.map(x=>x.signer.toLowerCase())).size!==signatures.length)
        throw new Error(`${date}: independent signature quorum missing`);
      for (const x of signatures) if (!await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:"isSigner",args:[x.signer]}))
        throw new Error(`${date}: unrecognized quote signer`);
      if(deployed.version>=3){
        const previousDay=await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:'lastPublishedDay'});
        if(previousDay){
          const required=await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:'expectedNextOpen',args:[previousDay]});
          if(required!==BigInt(openedAt)){
            const fix=attestations.calendarCorrection;
            if(!fix||fix.previousDay!==previousDay||BigInt(fix.expected)!==required||fix.corrected!==openedAt||!Array.isArray(fix.signatures))throw Error(`${date}: quorum-approved calendar repair required`);
            const args=[previousDay,required,BigInt(openedAt),fix.evidenceHash,fix.signatures.map(x=>x.signature)];
            let proposal=await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:'pendingCalendarCorrection'});
            if(proposal[0]&&proposal[0]!==previousDay){
              if(dry)return log('Stale calendar proposal needs permissionless cleanup');
              const tx=await wallet.writeContract({address:oracle,abi:marketOracleAbi,functionName:'discardStaleCalendarCorrection'});
              if((await pub.waitForTransactionReceipt({hash:tx})).status!=='success')throw Error('Stale calendar proposal cleanup reverted');
              proposal=await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:'pendingCalendarCorrection'});
            }
            if(!proposal[0]){
              const correction=await pub.simulateContract({account,address:oracle,abi:marketOracleAbi,functionName:'proposeCalendarCorrection',args});
              if(!dry){const tx=await wallet.writeContract(correction.request);if((await pub.waitForTransactionReceipt({hash:tx})).status!=='success')throw Error('Calendar proposal reverted');}
              return log('Calendar repair proposed; waiting for the on-chain 30-minute review period');
            }
            if(proposal[1]!==required||proposal[2]!==BigInt(openedAt)||proposal[6]!==fix.evidenceHash)throw Error('Pending calendar proposal differs from approved evidence');
            const block=await pub.getBlock();
            if(block.timestamp<proposal[3])return log('Calendar repair is timelocked; a later run will execute it');
            const correction=await pub.simulateContract({account,address:oracle,abi:marketOracleAbi,functionName:'executeCalendarCorrection'});
            if(!dry){const tx=await wallet.writeContract(correction.request);if((await pub.waitForTransactionReceipt({hash:tx})).status!=='success')throw Error('Calendar execution reverted');}
          }
        }
      }
      if (dry) { log(`${date}: quote signatures ready; publication and settlement not sent`); continue; }
      const {request}=await pub.simulateContract({account,address:oracle,abi:marketOracleAbi,functionName:"publish",args:[day,picked.map(p=>p.id),picked.map(p=>p.g),BigInt(openedAt),BigInt(closedAt),BigInt(nextOpen),quotesHash,signatures.map(x=>x.signature)]});
      const hash = await wallet.writeContract(request);
      const receipt = await pub.waitForTransactionReceipt({hash});
      if (receipt.status !== "success") throw new Error("Quorum quote publication reverted");
      [expected] = await pub.readContract({address:oracle,abi:marketOracleAbi,functionName:"session",args:[day]});
      at = nextOpen;
    }
    if (expected !== digest) throw new Error(`${date}: local results do not match quorum quote commitment; refusing settlement`);
    if (dry) continue;

    const ids = picked.map(p=>p.id), units = picked.map(p=>p.g);
    let active = await pub.readContract({address:deployed.pool,abi:poolAbi,functionName:"pendingDay"});
    if (active !== 0 && active !== day) throw new Error(`Earlier round ${active} must finish first`);
    let batches = 0;
    do {
      const functionName = active === 0 ? "settle" : "continueSettlement";
      const args = active === 0 ? [day,ids,units] : [ids,units];
      const {request} = await pub.simulateContract({account,address:deployed.pool,abi:poolAbi,functionName,args});
      const hash = await wallet.writeContract(request);
      const receipt = await pub.waitForTransactionReceipt({hash});
      if (receipt.status !== "success") throw new Error(`${date}: ${functionName} reverted (${hash})`);
      log(`${date} ${functionName} ${hash}, gas ${receipt.gasUsed}`);
      active = await pub.readContract({address:deployed.pool,abi:poolAbi,functionName:"pendingDay"});
      if (++batches > Math.ceil(tickers.length/64)+1) throw new Error("Settlement made no bounded progress");
    } while(active !== 0);
  }

  if (dayOf(prev) > lastDay && nyTimestamp(prev,570) >= launchAt && !pending.includes(prev)) throw new Error(`no recorded close for ${prev}`);
}

main().catch((e) => {
  console.error(safeError(e));
  process.exit(1);
});
