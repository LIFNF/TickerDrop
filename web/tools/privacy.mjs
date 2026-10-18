import {readFileSync, readdirSync, statSync} from "node:fs";
import {resolve, relative, join} from "node:path";
import {fileURLToPath} from "node:url";
export const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
export const privatePatterns=[
 ["GitHub token",/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
 ["Vercel token",/\bvcp_[A-Za-z0-9]{30,}\b/g],
 ["private key file",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
 ["private key assignment",/(?:PRIVATE_KEY|REPORTER_KEY|RELAYER_KEY)\s*[:=]\s*["']?(?:0x)?[a-fA-F0-9]{64}\b/gi],
 ["cloud access key",/\bAKIA[0-9A-Z]{16}\b/g],
];
export function findings(text){return privatePatterns.filter(([,pattern])=>{pattern.lastIndex=0;return pattern.test(text);}).map(([label])=>label);}
export function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
export function checkBeforeBuild(){
 const config=JSON.parse(readFileSync(join(root,"web/src/chain/deployed.json"),"utf8"));
 const addresses=[config.tickr,config.pool,config.drop,config.liquidityVault,config.marketOracle];
 const pending=config.version===2&&config.status==="pending"&&addresses.every(a=>/^0x0{40}$/i.test(a));
 if(config.chainId!==4663||(!pending&&addresses.some(a=>typeof a!=="string"||!/^0x[a-fA-F0-9]{40}$/.test(a)||/^0x0{40}$/i.test(a))))throw new Error("Use a complete deployment or an explicitly pending V2 configuration.");
 const publicDir=join(root,"web/public");
 const allowed=new Set(["favicon.svg","tickers.json","sessions.json","reference-quotes.json","img/city.webp","img/die.webp"]);
 for(const file of walk(publicDir)){
  const rel=relative(publicDir,file).replaceAll("\\","/");
  if(!allowed.has(rel))throw new Error(`Public file is not allowlisted: ${rel}`);
  if(/\.(?:json|svg)$/i.test(rel)&&findings(readFileSync(file,"utf8")).length)throw new Error(`Sensitive pattern in public asset: ${rel}`);
 }
 const forbidden=Object.keys(process.env).filter(k=>k.startsWith("VITE_")&&process.env[k]);
 if(forbidden.length)throw new Error("Privacy freeze: VITE_ environment variables are not permitted in browser builds.");
 for(const file of walk(join(root,"web/src"))){
  if(statSync(file).size>2e6)throw new Error("Unexpected browser source size");
  if(findings(readFileSync(file,"utf8")).length)throw new Error(`Sensitive pattern in browser source: ${relative(root,file)}`);
 }
}
export function checkArtifact(dir=join(root,"web/dist")){
 for(const file of walk(dir)){
  const rel=relative(dir,file).replaceAll("\\","/");
  if(!/^(?:index\.html|favicon\.svg|(?:backup\/)?(?:tickers|sessions|reference-quotes)\.json|img\/(?:city|die)\.webp|assets\/[A-Za-z0-9_-]+\.(?:js|css))$/.test(rel))throw new Error(`Forbidden artifact path: ${rel}`);
  if(/\.(?:html|js|css|json|svg)$/.test(rel)){
   const text=readFileSync(file,"utf8");
   if(findings(text).length||/sourceMappingURL|sourcesContent|pragma solidity|BEGIN PRIVATE KEY/.test(text)||text.includes("C:\\Users\\"))throw new Error(`Sensitive source material detected in ${rel}`);
  }
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes("--artifact"))checkArtifact();else checkBeforeBuild();
 console.log("Privacy checks passed; no sensitive values printed.");
}
