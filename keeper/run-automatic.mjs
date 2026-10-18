import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isLive} from './lib.mjs';
import {safeError} from './safe-error.mjs';
try{
 if(!isLive())console.log('V2 deployment pending. Automatic settlement is configured but not operational.');
 else {
  execFileSync(process.execPath,[fileURLToPath(new URL('settle.mjs',import.meta.url))],{stdio:'inherit',timeout:10*60000});
  execFileSync(process.execPath,[fileURLToPath(new URL('../tools/feed.mjs',import.meta.url))],{stdio:'inherit',timeout:2*60000});
 }
}catch(e){console.error(safeError(e));process.exitCode=1;}
