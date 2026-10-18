import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=(args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:30e6});
const rules=[
 ['access token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|vcp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})\b/],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['credential assignment',/(?:private[_-]?key|reporter[_-]?key|relayer[_-]?key|client[_-]?secret|api[_-]?secret|password)\s*[=:]\s*["']?(?:0x)?[a-zA-Z0-9/+_=-]{24,}/i],
 ['authenticated URL',/https?:\/\/[^\s/:]+:[^\s/@]+@/],
];
const issues=[];
function inspect(path,text){for(const [kind,re] of rules)if(re.test(text))issues.push(`${path}: ${kind}`);}
const paths=git(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean);
for(const path of paths){
 if(/(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|p12|pfx|keystore|har|trace))$/.test(path))issues.push(`${path}: sensitive file`);
 try{inspect(path,readFileSync(path,'utf8'));}catch{}
}
let history=0;
if(process.argv.includes('--history')){
 const objects=git(['rev-list','--objects','--all']).trim().split('\n');
 for(const row of objects){const split=row.indexOf(' ');if(split<0)continue;const sha=row.slice(0,split),path=row.slice(split+1);if(git(['cat-file','-t',sha]).trim()!=='blob')continue;history++;inspect(`history/${path}`,git(['cat-file','blob',sha]));}
}
if(issues.length){console.error([...new Set(issues)].join('\n'));process.exitCode=1;}
else console.log(`Secret checks passed: ${paths.length} candidate files, ${history} history blobs. Values are never logged.`);
