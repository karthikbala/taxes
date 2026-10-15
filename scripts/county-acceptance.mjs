// Explicit local operator acceptance; never run from tests, setup, CI or a lookup.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createSQLiteDB} from '../server/sqlite.mjs';
import {createJobStore} from '../server/job-store.mjs';
import {createCountyTracking} from '../server/county-tracking.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
if(!args['--db']||!args['--job']||!args['--category']||!args['--ui-proof']||args['--attest']!=='source-api-ui-verified')throw Error('Required: --db=PATH --job=ID --category=CATEGORY --ui-proof=PNG --attest=source-api-ui-verified. Verify the exact original source, authenticated result and rendered UI before attesting.');
const bytes=await readFile(args['--ui-proof']);if(bytes.length>10*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Use a captured PNG UI screenshot up to 10 MiB.');
const db=createSQLiteDB(args['--db']);try{const store=createJobStore(db),job=store.get(args['--job']);if(!job||job.status!=='completed')throw Error('Only a fully verified completed job may enter acceptance.');const proof=store.artifact(job.id,'acceptance-ui:'+randomUUID(),'acceptance_ui',bytes,{operator_attestation:'source-api-ui-verified',result_version:job.result_version});createCountyTracking(db,store).accept({id:randomUUID(),job_id:job.id,category:args['--category'],ui_artifact_id:proof.id});console.log(JSON.stringify({accepted:true,county:job.input.county,job_id:job.id,category:args['--category']}));}finally{db.close();}
