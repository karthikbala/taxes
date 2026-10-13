import {readFile,writeFile} from 'node:fs/promises';
const [origin,stateFile]=process.argv.slice(2),key=process.env.TAXES_SOAK_KEY;
if(!origin||!stateFile||!key||new URL(origin).protocol!=='https:')throw Error('Usage: TAXES_SOAK_KEY=<private key> node scripts/soak-reliability.mjs https://staging-origin private-state.json');
let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch{state={started_at:new Date().toISOString(),checks:[]};}
const headers={Authorization:'Bearer '+key};
const responses=await Promise.all(['/healthz','/api/v2/operations/retrieval'].map(path=>fetch(origin+path,{headers,signal:AbortSignal.timeout(15000)})));
const check={at:new Date().toISOString(),healthy:responses.every(r=>r.ok),metrics:responses[1].ok?await responses[1].json():null};state.checks.push(check);state.elapsed_days=(Date.now()-Date.parse(state.started_at))/86400000;
state.soak_complete=state.elapsed_days>=7;state.live_extraction_proof=false;
await writeFile(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(check));if(!check.healthy||check.metrics?.cleanup_pending>0)process.exitCode=1;
