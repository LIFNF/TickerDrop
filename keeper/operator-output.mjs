import {writeFileSync,renameSync,existsSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
export function saveOperatorAttestation(target,value,date,signer){
 const temp=new URL(target.href+'.'+process.pid+'.tmp');
 try{writeFileSync(temp,JSON.stringify(value)+'\n',{flag:'wx'});renameSync(temp,target);}
 finally{if(existsSync(temp))unlinkSync(temp);}
 if(process.env.OPERATOR_ARTIFACT_DIR){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^0x[a-fA-F0-9]{40}$/.test(signer))throw Error('Invalid public attestation path');
  const file=resolve(process.env.OPERATOR_ARTIFACT_DIR,date,signer+'.json');
  mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value)+'\n');
 }
}
