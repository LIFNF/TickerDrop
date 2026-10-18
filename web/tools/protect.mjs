import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from "node:fs";
import {join} from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";
import {root,walk,checkArtifact} from "./privacy.mjs";
const dist=join(root,"web/dist");
checkArtifact(dist); // Scan plaintext before obfuscation can encode sensitive literals.
for(const file of walk(dist)){
 if(!file.endsWith(".js")||/vendor-/.test(file))continue;
 const result=JavaScriptObfuscator.obfuscate(readFileSync(file,"utf8"),{
  compact:true,simplify:true,controlFlowFlattening:false,deadCodeInjection:false,
  identifierNamesGenerator:"hexadecimal",renameGlobals:false,selfDefending:false,
  stringArray:true,stringArrayEncoding:["base64"],stringArrayThreshold:0.65,
  transformObjectKeys:false,unicodeEscapeSequence:false,sourceMap:false,
  target:"browser-no-eval",seed:20261015,debugProtection:false
 });
 writeFileSync(file,result.getObfuscatedCode());
}
mkdirSync(join(dist,"backup"),{recursive:true});
for(const file of ["tickers.json","sessions.json"])copyFileSync(join(dist,file),join(dist,"backup",file));
checkArtifact(dist);
console.log("App code obfuscated locally; release allowlist and secret checks passed. This is not encryption.");
