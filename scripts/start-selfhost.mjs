// Node reads NODE_EXTRA_CA_CERTS before --env-file values can affect TLS.
// Launch the server with the reviewed public chain in its initial environment.
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);if(args.some(a=>a!=='--watch')||args.length>1)throw Error('Usage: start-selfhost.mjs [--watch]');
const child=spawn(process.execPath,[...args,resolve(root,'server/index.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,NODE_EXTRA_CA_CERTS:resolve(root,process.env.NODE_EXTRA_CA_CERTS||'vendor/tls/letsencrypt-yr2-chain.pem')}});
child.once('error',()=>{console.error('Could not start the self-host server.');process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.once('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'||signal==='SIGTERM'?0:1);});
